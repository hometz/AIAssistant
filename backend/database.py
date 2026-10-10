import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.errors import UniqueViolation
import hashlib
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "rag_db"),
    "user": os.getenv("DB_USER", "dinal"),
    "password": os.getenv("DB_PASSWORD", ""),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432")
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    create_users_table = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        verification_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_documents_table = """
    CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_messages_table = """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        role VARCHAR(10) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    cur.execute(create_users_table)
    cur.execute(create_documents_table)
    cur.execute(create_messages_table)
    conn.commit()
    cur.close()
    conn.close()
    print("База данных успешно инициализирована")

def create_unverified_user(username: str, email: str, password: str, code: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query_check = "SELECT id, is_verified FROM users WHERE email = %s OR username = %s"
        cur.execute(query_check, (email, username))
        existing_user = cur.fetchone()

        if existing_user:
            if existing_user['is_verified']:
                return False, "Пользователь с таким email или именем уже существует"
            else:
                query_update = "UPDATE users SET verification_code = %s, password_hash = %s WHERE id = %s"
                cur.execute(query_update, (code, hash_password(password), existing_user['id']))
                conn.commit()
                return True, "Код обновлен"

        query = "INSERT INTO users (username, email, password_hash, verification_code) VALUES (%s, %s, %s, %s) RETURNING id"
        cur.execute(query, (username, email, hash_password(password), code))
        conn.commit()
        return True, "Пользователь создан"
    except UniqueViolation:
        conn.rollback()
        return False, "Пользователь уже существует"
    finally:
        cur.close()
        conn.close()

def verify_user_code(email: str, code: str):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "UPDATE users SET is_verified = TRUE, verification_code = NULL WHERE email = %s AND verification_code = %s RETURNING id, username"
    cur.execute(query, (email, code))
    user = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return user

def authenticate_user(username: str, password: str):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "SELECT id, is_verified FROM users WHERE username = %s AND password_hash = %s"
    cur.execute(query, (username, hash_password(password)))
    user = cur.fetchone()
    cur.close()
    conn.close()
    if not user:
        return None, "Неверный логин или пароль"
    if not user['is_verified']:
        return None, "Почта не подтверждена"
    return str(user['id']), "OK"


def save_document(document_id: str, user_id: str, filename: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO documents (id, user_id, filename) VALUES (%s, %s, %s)", (document_id, user_id, filename))
    conn.commit()
    cur.close()
    conn.close()

def get_user_documents(user_id: str) -> list:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, filename, uploaded_at FROM documents WHERE user_id = %s ORDER BY uploaded_at DESC", (user_id,))
    documents = cur.fetchall()
    cur.close()
    conn.close()
    return documents

def save_message(document_id: str, role: str, content: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO chat_messages (document_id, role, content) VALUES (%s, %s, %s)", (document_id, role, content))
    conn.commit()
    cur.close()
    conn.close()

def get_chat_history(document_id: str, limit: int = 10):
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT role, content 
        FROM (SELECT role, content, created_at FROM chat_messages WHERE document_id = %s ORDER BY created_at DESC LIMIT %s) as recent
        ORDER BY created_at ASC;
    """
    cur.execute(query, (document_id, limit))
    messages = cur.fetchall()
    cur.close()
    conn.close()
    return messages

if __name__ == "__main__":
    init_db()