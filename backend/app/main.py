from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.db.mongodb import mongodb
from app.routers.auth import router as auth_router
from app.core.logging_config import setup_logging

setup_logging()
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup
    await mongodb.connect()

    yield

    # Application shutdown
    await mongodb.close()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Agentic RAG application for technical support resolution.",
    lifespan=lifespan
)


@app.get("/health")
def health_check():
    return {
        "status": "success",
        "message": "API is running",
        "environment": settings.environment
    }

app.include_router(auth_router)