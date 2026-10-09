import logging
import threading

from starlette.concurrency import run_in_threadpool
from pydantic import ValidationError

from app.core.config import settings
from app.rag.agentic.nodes import WorkflowUnavailable
from app.schemas.rag import ChatResponse
from app.services.conversation_service import (
    ConversationConflict, MAX_CONVERSATION_TURNS, recent_history,
)
from app.services.rag_resources import rag_resources

logger = logging.getLogger(__name__)


class AgenticRAGService:
    def __init__(self, resources=rag_resources):
        self.resources = resources
        # Local inference is serialized to avoid CPU/model contention. State stays per-call.
        # Other API routes remain asynchronous while a worker performs this work.
        self._execution_lock = threading.Lock()

    def execute(self, message: str, history: list[dict[str, str]]) -> dict:
        if not self._execution_lock.acquire(blocking=False):
            raise WorkflowUnavailable("RAG is busy; retry shortly")
        try:
            resources = self.resources.get()
            state = resources.graph.invoke(
                {"original_question": message, "current_query": message,
                 "resolved_question": message, "history": history, "retry_count": 0,
                 "attempted_queries": [], "retrieved_documents": [], "reranked_documents": [],
                 "sources": [], "rewrite_available": False, "evidence_sufficient": False},
                config={"recursion_limit": 24})
            # Explicit public projection; graph internals are neither stored nor returned.
            result = {key: state[key] for key in (
                "answer", "sources", "status", "escalation_recommended", "escalation_reason")}
            if len(result["answer"]) > 20000:
                raise WorkflowUnavailable("Answer exceeded the supported response size")
            return result
        except WorkflowUnavailable:
            raise
        except Exception:
            logger.error("Agentic workflow failed")
            raise WorkflowUnavailable("Support assistant is temporarily unavailable") from None
        finally:
            self._execution_lock.release()

    async def chat(self, request, current_user, conversations):
        owner_id = str(current_user["_id"])
        if request.conversation_id:
            conversation = await conversations.get(
                owner_id, str(request.conversation_id), recent=True,
                limit=max(1, settings.conversation_history_turns))
        else:
            conversation = await conversations.create(owner_id, request.message)
        if conversation["turn_count"] >= MAX_CONVERSATION_TURNS:
            raise ConversationConflict("Conversation is full; start a new conversation")
        history = recent_history(conversation, settings.conversation_history_turns)
        result = await run_in_threadpool(self.execute, request.message, history)
        # Validate before persisting; a malformed provider response never becomes a stored turn.
        try:
            response = ChatResponse(conversation_id=conversation["_id"], **result)
        except ValidationError:
            logger.error("Workflow produced an invalid public response")
            raise WorkflowUnavailable("Support assistant is temporarily unavailable") from None
        await conversations.append_turn(owner_id, conversation, request.message,
                                        response.model_dump(mode="json", exclude={"conversation_id"}))
        return response


agentic_rag_service = AgenticRAGService()
