import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user
from app.db.mongodb import mongodb
from app.rag.agentic.nodes import WorkflowUnavailable
from app.schemas.rag import ChatRequest, ChatResponse, ConversationHistory, ConversationList
from app.services.agentic_rag_service import agentic_rag_service
from app.services.conversation_service import (
    ConversationConflict, ConversationNotFound, ConversationService, ConversationStorageUnavailable,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["Support Chat"])


def get_conversation_service():
    if mongodb.database is None:
        raise HTTPException(status_code=503, detail="Conversation storage is unavailable")
    return ConversationService(mongodb.database)


def get_agentic_service():
    return agentic_rag_service


def public_error(exc):
    if isinstance(exc, ConversationNotFound):
        return HTTPException(status_code=404, detail="Conversation not found")
    if isinstance(exc, ConversationConflict):
        return HTTPException(status_code=409, detail="Conversation changed or reached its limit; retry or start a new conversation")
    logger.warning("Support request unavailable (%s)", type(exc).__name__)
    return HTTPException(status_code=503, detail="Support service is temporarily unavailable; retry shortly",
                         headers={"Retry-After": "10"})


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user=Depends(get_current_user),
               conversations=Depends(get_conversation_service), service=Depends(get_agentic_service)):
    try:
        return await service.chat(request, current_user, conversations)
    except (ConversationNotFound, ConversationConflict, ConversationStorageUnavailable, WorkflowUnavailable) as exc:
        raise public_error(exc) from None


@router.get("/conversations", response_model=ConversationList)
async def list_conversations(current_user=Depends(get_current_user),
                             conversations=Depends(get_conversation_service),
                             limit: int = Query(default=20, ge=1, le=100),
                             offset: int = Query(default=0, ge=0, le=10000)):
    try:
        documents = await conversations.list(str(current_user["_id"]), offset=offset, limit=limit)
        return {"conversations": [{"conversation_id": doc["_id"], "title": doc["title"],
                "created_at": doc["created_at"], "updated_at": doc["updated_at"],
                "turn_count": doc["turn_count"]} for doc in documents], "limit": limit, "offset": offset}
    except ConversationStorageUnavailable as exc:
        raise public_error(exc) from None


@router.get("/conversations/{conversation_id}", response_model=ConversationHistory)
async def conversation_history(conversation_id: UUID, current_user=Depends(get_current_user),
                               conversations=Depends(get_conversation_service),
                               limit: int = Query(default=20, ge=1, le=100),
                               offset: int = Query(default=0, ge=0, le=100)):
    try:
        document = await conversations.get(str(current_user["_id"]), str(conversation_id), offset=offset, limit=limit)
        messages = []
        for turn in document["turns"]:
            messages.append({"role": "user", "content": turn["user_message"], "created_at": turn["created_at"]})
            messages.append({"role": "assistant", "content": turn["answer"], "created_at": turn["created_at"],
                "sources": turn["sources"], "status": turn["status"],
                "escalation_recommended": turn["escalation_recommended"],
                "escalation_reason": turn.get("escalation_reason")})
        return {"conversation_id": conversation_id, "messages": messages,
                "total_turns": document["turn_count"], "limit": limit, "offset": offset}
    except (ConversationNotFound, ConversationStorageUnavailable) as exc:
        raise public_error(exc) from None
