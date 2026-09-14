import shutil
import os
from fastapi import FastAPI, UploadFile, File
import uuid
from services import pdf_loader
from schemas import AskRequest


app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "running..."}

@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())

    temp_file_path = f"temp_{file.filename}"
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:

        chunks = pdf_loader.process_pdf(temp_file_path)

        os.remove(temp_file_path)

        return {
            "file_id": file_id,
            "filename": file.filename,
            "chunks_count": len(chunks),
            "message": "Файл успешно обработан"
        }
    except Exception as e:
        # Если что-то пошло не так (например, файл не PDF), удаляем мусор и выдаем ошибку
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return {"error": str(e)}


    return {
        "file_id": file_id,
        "filename": file.filename,
        "message": "Файл успешно принят сервером"
    }

@app.get("/documents")
def list_documents():

    # Добавить логику обращения к Postgre

    return {"documents": []}

@app.post("chat/ask")
async def ask_question(request: AskRequest):

    # Добавить поиск контекста в ChromaDB и запрос к LLM

    return {"answer": "Временный ответ"}
