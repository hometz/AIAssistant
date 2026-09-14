from pydantic import BaseModel
from datetime import datetime

class User(BaseModel):
    id: int
    name: str = "John Doe"
    signup_ts: datetime | None
    tastes: dict[str, int]

external_data = {
    "id": "123",
    "signup_ts": "2019-06-01 12:22",
    "tastes": {"wine": 9, "cheese": 7}
}

user = User(**external_data)
print(user.id)            # 123 (строка → int)
print(user.model_dump())  # сериализация
