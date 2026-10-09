from app.rag.generation.rag_chain import generate_answer


def run_rag_pipeline(
    question: str,
    hybrid_retriever,
    reranker,
    retrieval_k: int = 10,
    final_k: int = 5,
) -> dict:
    """
    Run retrieval, reranking, and answer generation.
    """

    # Step 1: Hybrid retrieval
    candidates = hybrid_retriever.search(
        question,
        top_k=retrieval_k
    )

    # Step 2: Cross-encoder reranking
    retrieved_docs = reranker.rerank(
        query=question,
        documents=candidates,
        top_k=final_k
    )

    # Step 3: Context preparation, prompt augmentation,
    # LLM generation, and source metadata
    result = generate_answer(
        question=question,
        retrieved_docs=retrieved_docs
    )

    return result