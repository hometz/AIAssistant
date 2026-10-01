import torch
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, AcceleratorOptions
from langchain_text_splitters import MarkdownTextSplitter
from langchain_core.documents import Document


if torch.cuda.is_available():
    accel_device = "cuda"
    print("CUDA!!!!!!!!!!!!!!!!!!!!!!!!!")
elif torch.backends.mps.is_available():
    accel_device = "mps"
    print("MPS!!!!!!!!!!!!!!!!!!!!!!!!!!")
else:
    accel_device = "cpu"
    print("CPU!!!!!!!!!!!!!!!!!!!!!!!!!!")

print(f"--- Docling инициализирован на устройстве: {accel_device.upper()} ---")


def process_pdf(file_path: str) -> list[Document]:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.accelerator_options = AcceleratorOptions(
        num_threads = 8,
        device = accel_device
    )

    converter = DocumentConverter(
        allowed_formats = [InputFormat.PDF],
        format_options = {
            InputFormat.PDF: PdfFormatOption(pipeline_options = pipeline_options)
        }
    )

    result = converter.convert(file_path)
    full_markdown = result.document.export_to_markdown()

    splitter = MarkdownTextSplitter(chunk_size = 4000, chunk_overlap = 200)
    text_chunks = splitter.split_text(full_markdown)

    docs = []
    for i, text in enumerate(text_chunks):
        docs.append(Document(
            page_content=text,
            metadata={"page": i + 1, "source": file_path}
        ))

    return docs