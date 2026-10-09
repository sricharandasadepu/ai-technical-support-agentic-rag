from typing import Literal
from typing_extensions import TypedDict

from langchain_core.documents import Document


Intent = Literal["technical_support", "needs_clarification", "greeting", "out_of_scope"]
WorkflowStatus = Literal["answered", "clarification", "greeting", "out_of_scope", "escalated"]


class AgentState(TypedDict, total=False):
    original_question: str
    current_query: str
    resolved_question: str
    history: list[dict[str, str]]
    intent: Intent
    retrieved_documents: list[Document]
    reranked_documents: list[Document]
    evidence_sufficient: bool
    evidence_reason: str
    retry_count: int
    attempted_queries: list[str]
    rewrite_available: bool
    answer: str
    sources: list[dict]
    status: WorkflowStatus
    escalation_recommended: bool
    escalation_reason: str | None
