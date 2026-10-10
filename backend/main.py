import shutil
import os
import jwt
import random
import smtplib
from email.mime.text import MIMEText
from email.header import Header
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid
import database
from services import pdf_loader
from services import rag_logic
from schemas import AskRequest, RegisterRequest, LoginRequest, VerifyRequest
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

app = FastAPI()
security = HTTPBearer()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])


def create_access_token(user_id: str, username: str):
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "name": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except:
        raise HTTPException(status_code=401, detail="Невалидный токен")


def send_verification_email(to_email: str, code: str):
    sender = os.getenv("SMTP_SENDER")
    password = os.getenv("SMTP_PASSWORD")

    print(f"\n[MOCK EMAIL] Отправка на {to_email} | КОД: {code}\n")

    if sender and password:
        try:
            msg = MIMEText(f"Ваш код подтверждения: {code}", "plain", "utf-8")

            msg['Subject'] = Header('Код подтверждения RAG Assistant', 'utf-8')
            msg['From'] = sender
            msg['To'] = to_email

            server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
            server.login(sender, password)
            server.send_message(msg)
            server.quit()
            print(f"Письмо успешно отправлено на {to_email}")
        except Exception as e:
            print("Ошибка отправки email:", e)


@app.post("/users/register")
def register_user(request: RegisterRequest):
    code = str(random.randint(100000, 999999))
    success, message = database.create_unverified_user(request.username, request.email, request.password, code)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    send_verification_email(request.email, code)
    return {"message": "Код отправлен на почту"}


@app.post("/users/verify")
def verify_user(request: VerifyRequest):
    user = database.verify_user_code(request.email, request.code)
    if not user:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    token = create_access_token(str(user['id']), user['username'])
    return {"access_token": token, "username": user['username']}


@app.post("/users/login")
def login_user(request: LoginRequest):
    user_id, msg = database.authenticate_user(request.username, request.password)
    if not user_id:
        raise HTTPException(status_code=401, detail=msg)
    token = create_access_token(user_id, request.username)
    return {"access_token": token, "username": request.username}

@app.post("/documents/upload")
def upload_document(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    document_id = str(uuid.uuid4())
    temp_file_path = f"temp_{file.filename}"

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        docs = pdf_loader.process_pdf(temp_file_path)
        os.remove(temp_file_path)

        rag_logic.process_and_save_document(docs=docs, document_id=document_id)
        database.save_document(document_id=document_id, user_id=user_id, filename=file.filename)

        return {"document_id": document_id, "filename": file.filename, "message": "Успешно"}
    except Exception as e:
        if os.path.exists(temp_file_path): os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents")
def list_documents(user_id: str = Depends(get_current_user)):
    try:
        return {"documents": database.get_user_documents(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/ask")
def ask_question(request: AskRequest, user_id: str = Depends(get_current_user)):
    try:
        database.save_message(document_id=request.document_id, role="user", content=request.question)
        answer = rag_logic.ask_rag(question=request.question, document_id=request.document_id)
        database.save_message(document_id=request.document_id, role="ai", content=answer)
        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}

@app.get("/chat/history/{document_id}")
def get_history(document_id: str, user_id: str = Depends(get_current_user)):
    try:
        return {"messages": database.get_chat_history(document_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))