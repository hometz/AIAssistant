from pydantic import BaseModel, Field, field_validator
import re

class AskRequest(BaseModel):
    document_id: str
    question: str

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="От 3 до 50 символов")
    email: str = Field(..., pattern=r"^\S+@\S+\.\S+$", description="Некорректный email")
    password: str = Field(..., min_length=8, description="Минимум 8 символов")

    @field_validator('password')
    def validate_password(cls, v):
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError('Пароль должен содержать минимум одну букву и одну цифру')
        return v

class VerifyRequest(BaseModel):
    email: str
    code: str