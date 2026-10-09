"""Explicit, reproducible corpus build; never run by API startup.

Run from backend: python -m app.rag.ingestion.build_corpus --output data/kb_chunks.json
Add --upsert only when intentionally updating the existing Pinecone knowledge base.
"""

import argparse
import json
import logging
from pathlib import Path

from app.core.config import BACKEND_DIR

logger = logging.getLogger(__name__)


def build_snapshot(output: Path, *, upsert: bool = False) -> int:
    # Import here: Azure's existing singleton connects at import time.
    from app.rag.ingestion.azure_blob import azure_blob_service
    from app.rag.ingestion.loaders import document_loader
    from app.rag.ingestion.cleaner import document_cleaner
    from app.rag.ingestion.chunker import DocumentChunker
    from app.rag.corpus import load_corpus

    documents = []
    for blob_name in sorted(azure_blob_service.list_blobs()):
        if Path(blob_name).suffix.lower() not in {".txt", ".md", ".json", ".csv", ".pdf", ".docx"}:
            continue
        documents.extend(document_loader.load(blob_name, azure_blob_service.download_blob(blob_name)))
    chunks = DocumentChunker().chunk(document_cleaner.clean(documents))
    if not chunks:
        raise ValueError("Ingestion produced no chunks")
    snapshot = {"format_version": 1, "namespace": "nexadesk-kb", "chunks": [
        {"chunk_id": chunk.metadata["chunk_id"], "text": chunk.page_content,
         "metadata": chunk.metadata} for chunk in chunks]}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    try:
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        validated = load_corpus(temporary)
        if upsert:
            from app.rag.embeddings.embedding_service import EmbeddingService
            from app.rag.vectorstore.pinecone_store import PineconeStore
            embeddings = EmbeddingService()
            store = PineconeStore()
            try:
                if store.check_connection()["dimension"] != embeddings.dimension:
                    raise ValueError("Pinecone dimension does not match the embedding model")
                store.upsert_documents(validated, embeddings.embed_documents([d.page_content for d in validated]))
            finally:
                if hasattr(store.client, "close"):
                    store.client.close()
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()
    return len(chunks)


def main():
    parser = argparse.ArgumentParser(description="Build a canonical NexaDesk chunk snapshot")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--upsert", action="store_true", help="Explicitly upsert generated embeddings into Pinecone")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else BACKEND_DIR / args.output
    try:
        count = build_snapshot(output, upsert=args.upsert)
    except Exception as exc:
        # Provider exceptions can contain credentials or user data.
        print(f"Corpus build failed ({type(exc).__name__}). Check source data and service configuration.")
        raise SystemExit(1) from None
    print(f"Built {count} canonical chunks. Configure RAG_CORPUS_PATH to this snapshot.")


if __name__ == "__main__":
    main()
