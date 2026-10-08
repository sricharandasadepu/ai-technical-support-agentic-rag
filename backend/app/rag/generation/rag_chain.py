from langchain_core.documents import Document

from app.rag.generation.context_builder import build_context
from app.rag.generation.prompt_builder import build_rag_prompt
from app.rag.generation.llm_service import get_llm


def generate_answer(
    question: str,
    retrieved_docs: list[Document]
) -> dict:
    """
    Generate a grounded technical support answer
    using previously retrieved documents.
    """

    # 1. Prepare the retrieved context
    context = build_context(retrieved_docs)

    # 2. Build the augmented prompt
    prompt = build_rag_prompt()

    messages = prompt.format_messages(
        context=context,
        question=question
    )

    # 3. Initialize the LLM
    llm = get_llm()

    # 4. Generate the answer
    response = llm.invoke(messages)

    # 5. Return the answer and source references
    sources = [
        {
            "citation": f"[Source {index}]",
            "source": doc.metadata.get("source", "Unknown"),
            "chunk_id": doc.metadata.get("chunk_id"),
            "ticket_id": doc.metadata.get("ticket_id"),
        }
        for index, doc in enumerate(retrieved_docs, start=1)
    ]

    return {
        "question": question,
        "answer": response.content,
        "sources": sources,
    }