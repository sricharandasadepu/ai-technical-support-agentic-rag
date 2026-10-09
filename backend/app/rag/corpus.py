"""Load a canonical chunk snapshot and check its identity against Pinecone."""

import json
from pathlib import Path

from langchain_core.documents import Document
from app.rag.ingestion.chunker import DocumentChunker

NAMESPACE = "nexadesk-kb"


def chunk_identity(document: Document) -> str:
    # Reuse ingestion's existing identity algorithm rather than maintaining a second one.
    return DocumentChunker()._generate_chunk_id(document)


def load_corpus(path: Path) -> list[Document]:
    """Accept existing evaluation snapshot or a versioned ingestion snapshot.

    Evaluation queries are ignored; only canonical text/metadata chunks are used.
    """
    data = json.loads(path.read_text(encoding="utf-8"))
    chunks = data.get("chunks") if isinstance(data, dict) else None
    if not isinstance(chunks, list) or not chunks:
        raise ValueError("Corpus must contain a nonempty chunks array")
    if data.get("namespace", NAMESPACE) != NAMESPACE:
        raise ValueError("Corpus namespace does not match the existing knowledge base")
    documents, seen = [], set()
    for chunk in chunks:
        if not isinstance(chunk, dict):
            raise ValueError("Corpus chunks must be objects")
        text, metadata = chunk.get("text"), chunk.get("metadata")
        chunk_id = chunk.get("chunk_id")
        if not isinstance(text, str) or not text.strip() or not isinstance(metadata, dict):
            raise ValueError("Corpus has an invalid chunk")
        if not isinstance(chunk_id, str) or not chunk_id or chunk_id in seen:
            raise ValueError("Corpus has missing or duplicate chunk IDs")
        if metadata.get("chunk_id") not in (None, chunk_id):
            raise ValueError("Chunk ID disagrees with metadata")
        document = Document(page_content=text, metadata={**metadata, "chunk_id": chunk_id})
        if chunk_identity(document) != chunk_id:
            raise ValueError("Corpus chunk identity does not match its text and metadata")
        seen.add(chunk_id)
        documents.append(document)
    return documents


def verify_pinecone_corpus(index, documents: list[Document], dimension: int):
    """Verify exact corpus membership and text before enabling hybrid retrieval.

    Read-only fetches occur once per successful initialization, never per chat.
    An index with additional/missing chunks requires a matching fresh snapshot.
    """
    stats = index.describe_index_stats()
    if stats.dimension != dimension:
        raise ValueError("Pinecone index dimension does not match the embedding model")
    namespace = stats.namespaces.get(NAMESPACE)
    if namespace is None or namespace.vector_count != len(documents):
        raise ValueError("Pinecone namespace count does not match the canonical corpus")
    for start in range(0, len(documents), 100):
        batch = documents[start:start + 100]
        fetched = index.fetch(ids=[doc.metadata["chunk_id"] for doc in batch], namespace=NAMESPACE)
        for document in batch:
            vector = fetched.vectors.get(document.metadata["chunk_id"])
            if vector is None or dict(vector.metadata or {}).get("text") != document.page_content:
                raise ValueError("Pinecone chunk identity or text does not match the corpus")
            metadata = dict(vector.metadata or {})
            for key in ("source", "document_type", "ticket_id", "error_code", "section_number"):
                if document.metadata.get(key) != metadata.get(key):
                    raise ValueError("Pinecone citation metadata does not match the corpus")
