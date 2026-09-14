from pydantic import BaseModel
class AskRequest(BaseModel):
    question: str
    file_id: str