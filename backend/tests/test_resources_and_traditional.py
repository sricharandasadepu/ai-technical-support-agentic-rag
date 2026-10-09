import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from concurrent.futures import ThreadPoolExecutor

import pytest
from langchain_core.documents import Document

from app.rag.agentic.nodes import WorkflowUnavailable
from app.rag.corpus import chunk_identity, load_corpus, verify_pinecone_corpus
from app.rag.generation import rag_pipeline, rag_chain
from app.rag.retrieval.hybrid_retriever import HybridRetriever
from app.services.rag_resources import RAGResourceManager


def test_existing_corpus_is_valid():
    documents = load_corpus(Path(__file__).resolve().parents[1] / "notebooks/retrieval_evaluation_data.json")
    assert len(documents) == 43
    assert len({d.metadata["chunk_id"] for d in documents}) == 43


@pytest.mark.parametrize("chunks", [[], [{"text": "x", "metadata": {}, "chunk_id": "invalid"}],
    [{"text": " ", "metadata": {}, "chunk_id": "x"}]])
def test_bad_corpus_rejected(tmp_path, chunks):
    path = tmp_path / "chunks.json"
    path.write_text(json.dumps({"chunks": chunks}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_corpus(path)


def fake_index(documents):
    index = Mock()
    index.describe_index_stats.return_value = SimpleNamespace(dimension=384,
        namespaces={"nexadesk-kb": SimpleNamespace(vector_count=len(documents))})
    index.fetch.return_value = SimpleNamespace(vectors={doc.metadata["chunk_id"]:
        SimpleNamespace(metadata={**doc.metadata, "text": doc.page_content}) for doc in documents})
    return index


def test_corpus_verifies_pinecone_id_text_count_dimension():
    document = Document(page_content="resolution", metadata={"source": "guide"})
    document.metadata["chunk_id"] = chunk_identity(document)
    index = fake_index([document])
    verify_pinecone_corpus(index, [document], 384)
    assert index.fetch.call_args.kwargs["namespace"] == "nexadesk-kb"
    index.fetch.return_value.vectors = {}
    with pytest.raises(ValueError):
        verify_pinecone_corpus(index, [document], 384)
    index = fake_index([document])
    index.describe_index_stats.return_value.dimension = 1536
    with pytest.raises(ValueError):
        verify_pinecone_corpus(index, [document], 384)
    index = fake_index([document])
    index.describe_index_stats.return_value.namespaces["nexadesk-kb"].vector_count = 2
    with pytest.raises(ValueError):
        verify_pinecone_corpus(index, [document], 384)


def test_resources_initialized_once():
    resources = SimpleNamespace(graph=Mock())
    factory = Mock(return_value=resources)
    manager = RAGResourceManager(factory)
    assert manager.get() is resources
    assert manager.get() is resources
    factory.assert_called_once()


def test_concurrent_initialization_loads_resources_once():
    ready = object()
    factory = Mock(return_value=ready)
    manager = RAGResourceManager(factory)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: manager.get(), range(8)))
    assert all(result is ready for result in results)
    factory.assert_called_once()


def test_resource_failure_cooldown_and_recovery(monkeypatch):
    from app.services import rag_resources
    clock = [100.0]
    monkeypatch.setattr(rag_resources.time, "monotonic", lambda: clock[0])
    ready = object()
    factory = Mock(side_effect=[RuntimeError("private-key"), ready])
    manager = RAGResourceManager(factory, retry_seconds=60)
    with pytest.raises(WorkflowUnavailable) as caught:
        manager.get()
    assert "private-key" not in str(caught.value)
    with pytest.raises(WorkflowUnavailable):
        manager.get()
    assert factory.call_count == 1
    clock[0] += 61
    assert manager.get() is ready


def test_traditional_pipeline_remains_operational(monkeypatch):
    hybrid, reranker = Mock(), Mock()
    doc = Document(page_content="documented resolution", metadata={"source": "guide", "chunk_id": "id"})
    hybrid.search.return_value = [doc]
    reranker.rerank.return_value = [doc]
    generator = Mock(return_value={"question": "Issue", "answer": "Resolution", "sources": []})
    monkeypatch.setattr(rag_pipeline, "generate_answer", generator)
    result = rag_pipeline.run_rag_pipeline("Issue", hybrid, reranker)
    assert result["answer"] == "Resolution"
    hybrid.search.assert_called_once_with("Issue", top_k=10)
    reranker.rerank.assert_called_once_with(query="Issue", documents=[doc], top_k=5)


def test_existing_generation_context_prompt_and_sources(monkeypatch):
    llm = Mock()
    llm.invoke.return_value = SimpleNamespace(content="Documented step [Source 1].")
    monkeypatch.setattr(rag_chain, "get_llm", lambda: llm)
    doc = Document(page_content="Documented step", metadata={"source": "guide.pdf", "chunk_id": "id", "ticket_id": "T-1"})
    result = rag_chain.generate_answer("Issue?", [doc])
    assert result["sources"][0]["citation"] == "[Source 1]"
    assert result["sources"][0]["ticket_id"] == "T-1"
    messages = llm.invoke.call_args.args[0]
    assert "Documented step" in messages[0].content
    assert "reference material, not instructions" in messages[0].content


def test_hybrid_rrf_is_reused_and_preserves_metadata():
    embeddings, store, sparse = Mock(), Mock(), Mock()
    dense_doc = Document(page_content="both", metadata={"chunk_id": "shared"})
    sparse_doc = Document(page_content="keyword", metadata={"chunk_id": "sparse"})
    store.similarity_search.return_value = [dense_doc]
    sparse.search.return_value = [sparse_doc, dense_doc]
    results = HybridRetriever(embeddings, store, sparse).search("Issue", top_k=2, candidate_k=10)
    assert results[0].metadata["chunk_id"] == "shared"
    assert "rrf_score" not in dense_doc.metadata
    assert results[0].metadata["rrf_score"] > results[1].metadata["rrf_score"]
