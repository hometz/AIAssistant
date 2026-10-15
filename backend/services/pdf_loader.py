import torch
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, AcceleratorOptions
from langchain_text_splitters import MarkdownTextSplitter
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pdfplumber


def process_pdf(file_path: str, document_id: str) -> list[Document]:
    full_text = ""
    with pdfplumber.open(file_path) as pdf:
        total_pages = len(pdf.pages)
        if document_id:
            from services.rag_logic import progress_store
            progress_store[document_id] = {
                "status": "extracting",
                "current": 0,
                "total": total_pages
            }

        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text += text + "\n\n"

            if document_id:
                from services.rag_logic import progress_store
                progress_store[document_id]["current"] = i + 1


    splitter = RecursiveCharacterTextSplitter(
        chunk_size=4000,
        chunk_overlap=200
    )

    text_chunks = splitter.split_text(full_text)

    docs = []
    for i, text_chunk in enumerate(text_chunks):
        docs.append(Document(
            page_content=text_chunk,
            metadata={"page": i + 1, "source": file_path}
        ))

    return docs



# Старая обработка файла через Docling
# if torch.cuda.is_available():
#     accel_device = "cuda"
# elif torch.backends.mps.is_available():
#     accel_device = "mps"
# else:
#     accel_device = "cpu"
#
# print(f"--- Docling инициализирован на устройстве: {accel_device.upper()} ---")
#
# def process_pdf(file_path: str) -> list[Document]:
#     pipeline_options = PdfPipelineOptions()
#     pipeline_options.accelerator_options = AcceleratorOptions(
#         num_threads = 8,
#         device = accel_device
#     )
#
#     converter = DocumentConverter(
#         allowed_formats = [InputFormat.PDF],
#         format_options = {
#             InputFormat.PDF: PdfFormatOption(pipeline_options = pipeline_options)
#         }
#     )
#
#     result = converter.convert(file_path)
#     full_markdown = result.document.export_to_markdown()
#
#     splitter = MarkdownTextSplitter(chunk_size = 4000, chunk_overlap = 200)
#     text_chunks = splitter.split_text(full_markdown)
#
#     docs = []
#     for i, text in enumerate(text_chunks):
#         docs.append(Document(
#             page_content=text,
#             metadata={"page": i + 1, "source": file_path}
#         ))
#
#     return docs