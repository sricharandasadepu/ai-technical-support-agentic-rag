"""Lazy, process-wide RAG initialization with serialized inference and recovery."""

import logging
import threading
import time
from dataclasses import dataclass

from app.core.config import BACKEND_DIR, settings
from app.rag.agentic.graph import build_graph
from app.rag.agentic.nodes import AgentNodes, WorkflowUnavailable
from app.rag.agentic.policies import LLMDecisions, RetrievalPolicy
from app.rag.corpus import load_corpus, verify_pinecone_corpus
from app.rag.generation.llm_service import get_llm

logger = logging.getLogger(__name__)


@dataclass
class RAGResources:
    embedding_service: object
    pinecone_store: object
    bm25_retriever: object
    hybrid_retriever: object
    reranker: object
    graph: object


def initialize_resources() -> RAGResources:
    # Heavy dependencies and model downloads are deferred until first RAG use.
    from app.rag.embeddings.embedding_service import EmbeddingService
    from app.rag.vectorstore.pinecone_store import PineconeStore
    from app.rag.retrieval.bm25_retriever import BM25Retriever
    from app.rag.retrieval.hybrid_retriever import HybridRetriever
    from app.rag.retrieval.reranker import CrossEncoderReranker

    path = settings.rag_corpus_path
    if not path.is_absolute():
        path = BACKEND_DIR / path
    documents = load_corpus(path)
    store = PineconeStore()
    try:
        # This repository's existing store requires 384-dimensional query embeddings.
        verify_pinecone_corpus(store.index, documents, dimension=384)
        embeddings = EmbeddingService()
        if embeddings.dimension != 384:
            raise ValueError("Existing PineconeStore requires a 384-dimensional model")
        bm25 = BM25Retriever(documents)
        hybrid = HybridRetriever(embeddings, store, bm25)
        reranker = CrossEncoderReranker()
        policy = RetrievalPolicy(settings.rag_retrieval_k, settings.rag_candidate_k, settings.rag_final_k)
        graph = build_graph(AgentNodes(hybrid, reranker, LLMDecisions(get_llm()), policy))
        return RAGResources(embeddings, store, bm25, hybrid, reranker, graph)
    except Exception:
        try:
            if hasattr(store.client, "close"):
                store.client.close()
        except Exception:
            logger.warning("Pinecone cleanup after initialization failure failed")
        raise


class RAGResourceManager:
    def __init__(self, factory=initialize_resources, retry_seconds=None):
        self.factory = factory
        self.retry_seconds = retry_seconds if retry_seconds is not None else settings.rag_initialization_retry_seconds
        self._resources = None
        self._retry_after = 0.0
        self._lock = threading.Lock()

    def get(self):
        with self._lock:
            if self._resources is not None:
                return self._resources
            if time.monotonic() < self._retry_after:
                raise WorkflowUnavailable("RAG initialization is temporarily unavailable")
            try:
                self._resources = self.factory()
            except Exception as exc:
                self._retry_after = time.monotonic() + self.retry_seconds
                # Only exception class: provider error strings may contain secrets/content.
                logger.error("RAG initialization failed (%s); check corpus, models and service configuration",
                             type(exc).__name__)
                raise WorkflowUnavailable("RAG initialization is temporarily unavailable") from None
            logger.info("Shared RAG resources initialized")
            return self._resources

    def close(self):
        with self._lock:
            if self._resources is not None:
                client = self._resources.pinecone_store.client
                try:
                    if hasattr(client, "close"):
                        client.close()
                except Exception:
                    logger.warning("Pinecone client cleanup failed")
                finally:
                    self._resources = None


rag_resources = RAGResourceManager()
