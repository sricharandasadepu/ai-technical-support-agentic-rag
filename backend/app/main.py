from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
import logging

from app.core.config import settings
from app.db.mongodb import mongodb
from app.routers.auth import router as auth_router
from app.core.logging_config import setup_logging
from app.routers.rag import router as rag_router
from app.services.conversation_service import ConversationService
from app.services.rag_resources import rag_resources
from starlette.concurrency import run_in_threadpool

setup_logging()
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup
    await mongodb.connect()

    try:
        await ConversationService(mongodb.database).ensure_indexes()
        # RAG models/index verification load lazily in a worker on first chat.
        yield
    finally:
        try:
            await run_in_threadpool(rag_resources.close)
        finally:
            await mongodb.close()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Agentic RAG application for technical support resolution.",
    lifespan=lifespan
)


@app.exception_handler(PyMongoError)
async def database_error_handler(request, exc):
    # Covers DB failures in the existing auth dependency too, without changing JWT behavior.
    logging.getLogger(__name__).warning("Database request failed (%s)", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "Database service is temporarily unavailable"},
                        headers={"Retry-After": "10"})


@app.get("/health")
def health_check():
    return {
        "status": "success",
        "message": "API is running",
        "environment": settings.environment
    }

app.include_router(auth_router)
app.include_router(rag_router)
