import psycopg2
from psycopg2.extras import RealDictCursor
import uuid

DB_CONFIG = {
    "dbname": "rag_db",
    "user": "",
    "password": "",
    "host": "localhost",
    "port": "5432"
}


def get_db_connection():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Таблица Пользователей
    create_users_table = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    # 2. Таблица Документов (Связь 1:N с users)
    create_documents_table = """
    CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    # 3. Таблица Сообщений (Связь 1:N с documents)
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



def create_user(username: str) -> str:
    conn = get_db_connection()
    cur = conn.cursor()
    query = "INSERT INTO users (username) VALUES (%s) RETURNING id"
    cur.execute(query, (username,))
    user_id = cur.fetchone()['id']
    conn.commit()
    cur.close()
    conn.close()
    return str(user_id)


def save_document(document_id: str, user_id: str, filename: str):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "INSERT INTO documents (id, user_id, filename) VALUES (%s, %s, %s)"
    cur.execute(query, (document_id, user_id, filename))
    conn.commit()
    cur.close()
    conn.close()


def get_user_documents(user_id: str) -> list:
    conn = get_db_connection()
    cur = conn.cursor()
    query = "SELECT id, filename, uploaded_at FROM documents WHERE user_id = %s ORDER BY uploaded_at DESC"
    cur.execute(query, (user_id,))
    documents = cur.fetchall()
    cur.close()
    conn.close()
    return documents


def save_message(document_id: str, role: str, content: str):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "INSERT INTO chat_messages (document_id, role, content) VALUES (%s, %s, %s)"
    cur.execute(query, (document_id, role, content))
    conn.commit()
    cur.close()
    conn.close()


def get_chat_history(document_id: str, limit: int = 10):
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT role, content 
        FROM (
            SELECT role, content, created_at
            FROM chat_messages 
            WHERE document_id = %s 
            ORDER BY created_at DESC 
            LIMIT %s
        ) as recent_messages
        ORDER BY created_at ASC;
    """
    cur.execute(query, (document_id, limit))
    messages = cur.fetchall()
    cur.close()
    conn.close()
    return messages


if __name__ == "__main__":
    init_db()