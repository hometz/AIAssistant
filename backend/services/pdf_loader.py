from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pdfplumber
import gc


def process_pdf(file_path: str, document_id: str) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=200)
    docs = []

    with pdfplumber.open(file_path) as pdf:
        total_pages = len(pdf.pages)

        if document_id:
            from services.rag_logic import progress_store
            progress_store[document_id] = {"status": "extracting", "current": 0, "total": total_pages}

        for i, page in enumerate(pdf.pages):
            text = page.extract_text()

            if text and text.strip():
                page_chunks = splitter.split_text(text)
                for chunk in page_chunks:
                    docs.append(Document(
                        page_content=chunk,
                        metadata={"page": i + 1, "source": file_path}
                    ))

            page.flush_cache()

            if document_id:
                from services.rag_logic import progress_store
                progress_store[document_id]["current"] = i + 1

        gc.collect()

    return docs
