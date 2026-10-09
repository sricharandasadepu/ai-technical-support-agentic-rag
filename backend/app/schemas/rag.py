from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.rag.agentic.state import WorkflowStatus


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: UUID | None = None


class SourceReference(BaseModel):
    citation: str
    source: str
    chunk_id: str | None = None
    ticket_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    conversation_id: UUID
    status: WorkflowStatus
    escalation_recommended: bool
    escalation_reason: str | None = None


class ConversationSummary(BaseModel):
    conversation_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    turn_count: int


class ConversationList(BaseModel):
    conversations: list[ConversationSummary]
    limit: int
    offset: int


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    sources: list[SourceReference] = Field(default_factory=list)
    status: WorkflowStatus | None = None
    escalation_recommended: bool = False
    escalation_reason: str | None = None


class ConversationHistory(BaseModel):
    conversation_id: UUID
    messages: list[HistoryMessage]
    total_turns: int
    limit: int
    offset: int
