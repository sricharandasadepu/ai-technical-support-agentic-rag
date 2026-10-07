from fastapi import FastAPI
from app.core.config import settings


app = FastAPI(
    title="AI Technical Support Resolution Assistant",
    description="Agentic RAG application for technical support resolution.",
    version="1.0.0"
)

@app.get("/health")
async def health():
    """
    Check whether the API is running.
    """
    return {
        "status": "success",
        "message": "API is running",
        "environment": settings.environment
    }