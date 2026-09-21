import shutil
import os
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
from services import pdf_loader
from services import rag_logic
import database
from schemas import AskRequest


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "running..."}

@app.post("/users/register")
def register_user(username: str):
    try:
        user_id = database.create_user(username)
        return {"user_id": user_id, "username": username}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка при создании пользователя: {str(e)}")


@app.post("/documents/upload")
def upload_document(file: UploadFile = File(...), x_user_id: str = Header(...)):
    if not x_user_id:
        raise HTTPException(status_code = 401, detail = "Заголовок x-user-id обязателен")

    document_id = str(uuid.uuid4())
    temp_file_path = f"temp_{file.filename}"

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:

        chunks = pdf_loader.process_pdf(temp_file_path)
        os.remove(temp_file_path)

        rag_logic.save_chunks_to_vector_db(chunks, document_id)

        database.save_document(document_id = document_id, user_id = x_user_id, filename = file.filename)

        return {
            "document_id": document_id,
            "filename": file.filename,
            "chunks_count": len(chunks),
            "message": "Файл успешно обработан"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents")
def list_documents(x_user_id: str = Header(...)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Заголовок x-user-id обязателен")

    try:
        document = database.get_user_documents(x_user_id)
        return {"documents": document}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/ask")
def ask_question(request: AskRequest):
    try:
        database.save_message(
            document_id=request.document_id,
            role="user",
            content=request.question
        )

        answer = rag_logic.ask_rag(question = request.question, document_id = request.document_id)

        database.save_message(
            document_id=request.document_id,
            role="ai",
            content=answer
        )

        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}
