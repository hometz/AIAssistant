import os
from dotenv import load_dotenv
from langchain_community.embeddings.dashscope import BATCH_SIZE

load_dotenv()

from database import get_chat_history
from langchain_google_genai import ChatGoogleGenerativeAI
from chromadb.utils import embedding_functions
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_chroma import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

embeddings = OllamaEmbeddings(model = "nomic-embed-text-v2-moe:latest")

#llm = ChatOllama(model = "gemma4:latest", temperature = 0.2)
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0.2)
CHROMA_PATH = "./chroma_db"


def save_chunks_to_vector_db(chunks, document_id: str):
    for chunk in chunks:
        chunk.metadata["document_id"] = document_id


    vector_store = Chroma(
        persist_directory = CHROMA_PATH,
        embedding_function = embeddings
    )

    batch_size = 100
    total_chunks = len(chunks)

    print(f"Начинаем векторизацию {total_chunks} чанков пакетами по {batch_size}...")

    for i in range(0, total_chunks, batch_size):
        batch = chunks[i : i + batch_size]

        texts = [chunk.page_content for chunk in batch]
        metadatas = [chunk.metadata for chunk in batch]

        vector_store.add_texts(texts = texts, metadatas = metadatas)

        print(f"Обработано {min(i + batch_size, total_chunks)} / {total_chunks}")

    print("Векторизация документа успешно завершена!")

    return True


def ask_rag(question:str, document_id:str) -> str:
    raw_history = get_chat_history(document_id, limit = 10)

    history_text = ""
    if raw_history:
        for msg in raw_history:
            sender = ""
            if msg['role'] == 'user':
                sender = "Пользователь"
            else:
                sender = "Ассистент"

            history_text += f"{sender}: {msg['content']}\n"

    else:
        history_text = "Это первое сообщение, истории пока нет."

    vector_store = Chroma(
        persist_directory = CHROMA_PATH,
        embedding_function = embeddings
    )

    results = vector_store.similarity_search(
        query = question,
        k = 3,
        filter = {"document_id" : document_id}
    )

    if not results:
        return "По данному контексту ничего не найдено. Проверте загруженн ли файл"

    context = "\n\n".join([doc.page_content for doc in results])

    template = """
    Ты умный ассистент, который помогает анализировать документ.
    Отвечай на вопрос пользователя, основываясь ТОЛЬКО на контексте документа.
    Если ответа нет в контексте, так и скажи. Учитывай историю диалога.

    История нашего диалога:
    {history}

    Контекст из документа:
    {context}

    Новый вопрос пользователя: {question}
    Ответ:
    """

    prompt = PromptTemplate.from_template(template)

    chain = prompt | llm | StrOutputParser()

    print("\n" + "=" * 30)
    print("ИСТОРИЯ, КОТОРУЮ ВИДИТ ИИ:\n", history_text)
    print("=" * 30 + "\n")

    response = chain.invoke({
        "context": context,
        "question": question,
        "history": history_text
    })

    return response