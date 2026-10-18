import os
import json
import uuid
import logging
import time
import re
from dotenv import load_dotenv
from langchain_classic.retrievers import ParentDocumentRetriever
from langchain_community.embeddings.dashscope import BATCH_SIZE
from langchain_text_splitters import RecursiveCharacterTextSplitter
from database import get_chat_history
from langchain_google_genai import ChatGoogleGenerativeAI
from chromadb.utils import embedding_functions
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_chroma import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_classic.storage import LocalFileStore, EncoderBackedStore
from langchain_classic.memory import ConversationBufferMemory
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_classic.retrievers.multi_query import MultiQueryRetriever
from langchain_core.documents import Document
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

load_dotenv()

logging.basicConfig(level=logging.INFO)
logging.getLogger("langchain.retrievers.multi_query").setLevel(logging.DEBUG)

embeddings = OllamaEmbeddings(model = "nomic-embed-text-v2-moe:latest")
PARENT_DOCS_PATH = "parent_docs_db"
#llm = ChatOllama(model = "gemma4:latest", temperature = 0.2)
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0.2)
CHROMA_PATH = "./chroma_db"

def _norm_word(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower().replace("ё", "е"))

def _doc_to_bytes(doc: Document) -> bytes:
    return json.dumps({
        "page_content": doc.page_content,
        "metadata": doc.metadata
    }).encode("utf-8")

def _bytes_to_doc(b: bytes) -> Document:
    data = json.loads(b.decode("utf-8"))
    return Document(
        page_content = data["page_content"],
        metadata = data["metadata"]
    )

def get_pdr_retriever(document_id: str = None):
    vector_store = Chroma(persist_directory = CHROMA_PATH, embedding_function = embeddings)

    file_store = LocalFileStore(PARENT_DOCS_PATH)
    doc_store = EncoderBackedStore(
        store = file_store,
        key_encoder = lambda k: k,
        value_serializer = _doc_to_bytes,
        value_deserializer = _bytes_to_doc
    )

    parent_splitter = RecursiveCharacterTextSplitter(chunk_size = 2000, chunk_overlap = 200)
    child_splitter  = RecursiveCharacterTextSplitter(chunk_size = 400, chunk_overlap = 50)

    search_kwargs = {"k": 4}

    if document_id:
        search_kwargs["filter"] = {"document_id": document_id}

    return ParentDocumentRetriever(
        vectorstore = vector_store,
        docstore = doc_store,
        parent_splitter = parent_splitter,
        child_splitter = child_splitter,
        search_kwargs = search_kwargs
    )



def save_chunks_to_vector_db(chunks:list[Document], vector_store: Chroma):
    BATCH_SIZE = 50

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [doc.page_content for doc in batch]
        metadatas = [chunk.metadata for chunk in batch]
        vector_store.add_texts(texts = texts, metadatas = metadatas)

        time.sleep(0.05)



progress_store = {}

def process_and_save_document(docs: list[Document], document_id: str):

    progress_store[document_id] = {"status": "processing", "current": 0, "total": len(docs)}

    for doc in docs:
        doc.metadata["document_id"] = document_id

    retriever = get_pdr_retriever(document_id=document_id)

    total_pages = len(docs)

    if total_pages <= 50:
        BATCH_SIZE = 5
    elif total_pages <= 200:
        BATCH_SIZE = 10
    else:
        BATCH_SIZE = 100

    for i in range(0, len(docs), BATCH_SIZE):
        batch_docs = docs[i: i + BATCH_SIZE]

        parent_docs = retriever.parent_splitter.split_documents(batch_docs)
        doc_ids = [str(uuid.uuid4()) for _ in parent_docs]

        retriever.docstore.mset(list(zip(doc_ids, parent_docs)))

        child_docs = []
        for j, parent_doc in enumerate(parent_docs):
            _children = retriever.child_splitter.split_documents([parent_doc])
            for child in _children:
                if child.page_content and child.page_content.strip():
                    child.metadata[retriever.id_key] = doc_ids[j]
                    child_docs.append(child)

        if child_docs:
            save_chunks_to_vector_db(child_docs, retriever.vectorstore)

        progress_store[document_id]["current"] = min(i + BATCH_SIZE, len(docs))

        #time.sleep(0.1)

    progress_store[document_id]["status"] = "completed"
    return True



def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
            elif hasattr(item, "text"):
                parts.append(str(item.text))
        return "\n".join(parts)
    return str(content)


def _stem(w: str) -> str:
    clean = re.sub(r"[^\w]", "", w.lower().replace("ё", "е"))
    if clean.isdigit():
        return clean
    if len(clean) < 4:
        return ""
    return clean[:5]


def ask_rag(question: str, document_id: str) -> tuple[str, list[dict]]:
    raw_history = get_chat_history(document_id, limit=10)

    retriever = get_pdr_retriever(document_id=document_id)
    vectorstore = retriever.vectorstore
    docstore = retriever.docstore
    id_key = retriever.id_key

    mqr_template = f"""Ты — ИИ-помощник исследователя. Твоя задача — сгенерировать 3 различных варианта заданного вопроса, чтобы улучшить поиск документов в векторной базе данных. 
    Если в вопросе есть числительные словами (например, "третий", "второй"), обязательно напиши их цифрами ("3", "2") в вариантах вопроса.
    Выведи ТОЛЬКО сами вопросы, каждый с новой строки, без нумерации и дефисов.

    Оригинальный вопрос: {question}"""

    mq_raw = llm.invoke(mqr_template).content
    mq_result = _extract_text(mq_raw)
    queries = [q.strip() for q in mq_result.split("\n") if len(q.strip()) > 3]

    if question not in queries:
        queries.insert(0, question)

    search_kwargs = {"k": 3}
    if document_id:
        search_kwargs["filter"] = {"document_id": document_id}

    child_docs = []
    seen_content = set()

    for q in queries:
        docs = vectorstore.similarity_search(q, **search_kwargs)
        for d in docs:
            if d.page_content not in seen_content:
                child_docs.append(d)
                seen_content.add(d.page_content)

    if not child_docs:
        return "Ответ не найден.", []

    parent_ids = list(dict.fromkeys([doc.metadata[id_key] for doc in child_docs if id_key in doc.metadata]))
    parent_docs = [doc for doc in docstore.mget(parent_ids) if doc]
    context = "\n\n---\n\n".join([doc.page_content for doc in parent_docs])

    messages = [
        SystemMessage(content=f"""Используй предоставленный контекст для ответа на вопрос. 
Если ответа нет в контексте, прямо скажи, что не знаешь ответа, не пытайся его выдумать.
Отвечай подробно и структурированно.

ОБЯЗАТЕЛЬНОЕ ПРАВИЛО ДЛЯ ПОДСВЕТКИ В PDF:
В самом конце своего ответа с новой строки напиши разделитель ===ЦИТАТА=== и сразу после него скопируй ДОСЛОВНО (слово в слово, без единого изменения) ТОЛЬКО тот абзац или блок из Контекста, где находится ответ на вопрос. Не копируй соседние слайды или лишние разделы.

Контекст:
{context}""")
    ]

    for msg in raw_history:
        msg_text = _extract_text(msg["content"])
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg_text))
        else:
            messages.append(AIMessage(content=msg_text))

    messages.append(HumanMessage(content=question))

    response = llm.invoke(messages)
    full_output = _extract_text(response.content).strip()

    if "===ЦИТАТА===" in full_output:
        parts = full_output.split("===ЦИТАТА===", 1)
        answer = parts[0].strip()
        exact_quote = parts[1].strip()
    else:
        answer = full_output
        exact_quote = ""

    if not answer or "не знаю" in answer.lower() or "нет информации" in answer.lower():
        return answer if answer else "Ответ не найден.", []

    sources = []

    if exact_quote:
        quote_stems = {_stem(w) for w in exact_quote.split() if _stem(w)}
        best_page = 1
        best_overlap = -1

        for p_doc in parent_docs:
            p_stems = {_stem(w) for w in p_doc.page_content.split() if _stem(w)}
            overlap = len(quote_stems & p_stems)
            if overlap > best_overlap:
                best_overlap = overlap
                page_val = p_doc.metadata.get("page", 1)
                best_page = int(page_val) if str(page_val).isdigit() else 1

        sources.append({"page": best_page, "text": exact_quote})
    else:
        ans_stems = {_stem(w) for w in answer.split() if _stem(w)}
        best_page = 1
        matched_lines = []

        for p_doc in parent_docs:
            page_val = p_doc.metadata.get("page", 1)
            p_num = int(page_val) if str(page_val).isdigit() else 1
            for line in p_doc.page_content.split("\n"):
                l_stems = {_stem(w) for w in line.split() if _stem(w)}
                if len(l_stems & ans_stems) >= 2:
                    matched_lines.append(line.strip())
                    best_page = p_num

        if matched_lines:
            sources.append({"page": best_page, "text": "\n".join(matched_lines[:6])})

    print("\n" + "=" * 50)
    print(f"[RAG DEBUG] Ответ модели:\n{answer}")
    print("-" * 50)
    print(f"[RAG DEBUG] Извлеченная цитата для подсветки (стр. {sources[0]['page'] if sources else '?'}):\n{sources[0]['text'] if sources else 'НЕТ ЦИТАТЫ'}")
    print("=" * 50 + "\n")

    print(
        f"[RAG DEBUG] Выделена цитата ({len(sources[0]['text']) if sources else 0} симв.) на стр. {[s['page'] for s in sources]}"
    )
    return answer, sources