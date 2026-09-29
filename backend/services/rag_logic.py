import os
import json
import uuid
import logging
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

load_dotenv()

logging.basicConfig(level=logging.INFO)
logging.getLogger("langchain.retrievers.multi_query").setLevel(logging.DEBUG)

embeddings = OllamaEmbeddings(model = "nomic-embed-text-v2-moe:latest")
PARENT_DOCS_PATH = "parent_docs_db"
#llm = ChatOllama(model = "gemma4:latest", temperature = 0.2)
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0.2)
CHROMA_PATH = "./chroma_db"

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
    BATCH_SIZE = 100

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [doc.page_content for doc in batch]
        metadatas = [chunk.metadata for chunk in batch]
        vector_store.add_texts(texts = texts, metadatas = metadatas)


def process_and_save_document(docs: list[Document], document_id: str):
    for doc in docs:
        doc.metadata["document_id"] = document_id

    retriever = get_pdr_retriever()

    parent_docs = retriever.parent_splitter.split_documents(docs)
    doc_ids = [str(uuid.uuid4()) for _ in parent_docs]

    retriever.docstore.mset(list(zip(doc_ids, parent_docs)))

    child_docs = []
    for i, parent_doc in enumerate(parent_docs):
        _children = retriever.child_splitter.split_documents([parent_doc])
        for child in _children:
            child.metadata[retriever.id_key] = doc_ids[i]
            child_docs.append(child)

    save_chunks_to_vector_db(child_docs, retriever.vectorstore)

    return True



def ask_rag(question:str, document_id:str) -> str:
    raw_history = get_chat_history(document_id, limit = 10)
    memory = ConversationBufferMemory(memory_key = "chat_history", return_messages = True)

    for msg in raw_history:
        if msg["role"] == "user":
            memory.chat_memory.add_user_message(msg["content"])
        else:
            memory.chat_memory.add_ai_message(msg["content"])

    base_retriever = get_pdr_retriever(document_id = document_id)

    mqr_template = """Ты — ИИ-помощник исследователя. Твоя задача — сгенерировать 3 различных варианта заданного вопроса, чтобы улучшить поиск документов в векторной базе данных. 
    Переформулируй вопрос, используя синонимы, альтернативные термины или смещая акцент, но сохраняй изначальный смысл.
    Выведи ТОЛЬКО сами вопросы, каждый с новой строки, без нумерации, без дефисов в начале и без вводных слов. Никакого дополнительного текста.

    Оригинальный вопрос: {question}"""

    mqr_prompt = PromptTemplate(
        input_variables = ["question"],
        template = mqr_template
    )

    advanced_retriever = MultiQueryRetriever.from_llm(
        retriever = base_retriever,
        llm = llm,
        prompt = mqr_prompt
    )


    prompt_template = """Используй предоставленный контекст для ответа на вопрос. 
    Если ответа нет в контексте, прямо скажи, что не знаешь ответа, не пытайся его выдумать.
    Отвечай подробно и структурированно.

    Контекст:
    {context}

    Вопрос пользователя: {question}

    Ответ:"""

    qa_prompt = PromptTemplate(
        template = prompt_template,
        input_variables = ["context", "question"]
    )

    qa_chain = ConversationalRetrievalChain.from_llm(
        llm = llm,
        retriever = advanced_retriever,
        memory = memory,
        combine_docs_chain_kwargs = {"prompt": qa_prompt}
    )

    result = qa_chain.invoke({"question": question})
    return result["answer"]