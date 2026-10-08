from langchain_groq import ChatGroq
from app.core.config import settings


def get_llm() -> ChatGroq:
    """
    Initialize the Groq LLM for RAG answer generation.
    """

    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=0,
    )
    