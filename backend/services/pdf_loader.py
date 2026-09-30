from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyMuPDFLoader

def process_pdf(file_path: str):
    loader = PyMuPDFLoader(file_path)
    return loader.load()

