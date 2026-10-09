import logging
from typing import Callable

from app.rag.agentic.policies import (
    EvidenceDecision, IntentDecision, MAX_RETRIES, RetrievalPolicy,
    RewriteDecision, normalize_query,
)
from app.rag.agentic.state import AgentState
from app.rag.generation.rag_chain import generate_answer
from app.rag.evaluation.generation_metrics import evaluate_citation_validity

logger = logging.getLogger(__name__)


class WorkflowUnavailable(RuntimeError):
    """An operational failure, distinct from insufficient knowledge evidence."""


class AgentNodes:
    def __init__(self, hybrid_retriever, reranker, decisions,
                 policy: RetrievalPolicy | None = None,
                 generator: Callable = generate_answer):
        self.hybrid_retriever = hybrid_retriever
        self.reranker = reranker
        self.decisions = decisions
        self.policy = policy or RetrievalPolicy()
        self.generator = generator

    def classify(self, state: AgentState) -> dict:
        try:
            decision = IntentDecision.model_validate(self.decisions.classify(
                state["original_question"], state.get("history", [])))
            resolved = decision.standalone_question.strip()
            if not resolved:
                raise ValueError("Empty standalone question")
            return {"intent": decision.intent, "resolved_question": resolved,
                    "current_query": resolved}
        except Exception:
            logger.warning("Intent classification failed; requesting clarification")
            return {"intent": "needs_clarification",
                    "resolved_question": state["original_question"]}

    def respond(self, state: AgentState) -> dict:
        replies = {
            "greeting": ("greeting", "Hello! What NexaDesk issue can I help you troubleshoot?"),
            "needs_clarification": ("clarification", "Please describe the NexaDesk issue, "
                "including any error message and what you were trying to do."),
            "out_of_scope": ("out_of_scope", "I can help with NexaDesk Cloud technical "
                "support. Please ask about a NexaDesk issue or product behavior."),
        }
        status, answer = replies[state["intent"]]
        return {"status": status, "answer": answer, "sources": [],
                "escalation_recommended": False, "escalation_reason": None}

    def retrieve(self, state: AgentState) -> dict:
        try:
            documents = self.hybrid_retriever.search(
                state["current_query"], top_k=self.policy.retrieval_k,
                candidate_k=self.policy.candidate_k)
        except Exception:
            logger.error("Hybrid retrieval failed")
            raise WorkflowUnavailable("Knowledge retrieval is temporarily unavailable") from None
        return {"retrieved_documents": documents, "reranked_documents": [],
                "attempted_queries": [*state.get("attempted_queries", []), state["current_query"]]}

    def rerank(self, state: AgentState) -> dict:
        try:
            documents = self.reranker.rerank(
                query=state["resolved_question"], documents=state["retrieved_documents"],
                top_k=self.policy.final_k)
        except Exception:
            logger.error("Reranking failed")
            raise WorkflowUnavailable("Knowledge ranking is temporarily unavailable") from None
        return {"reranked_documents": documents}

    def grade(self, state: AgentState) -> dict:
        if not state["reranked_documents"]:
            return {"evidence_sufficient": False, "evidence_reason": "No supporting documents found."}
        try:
            decision = EvidenceDecision.model_validate(self.decisions.grade(
                state["resolved_question"], state["reranked_documents"]))
            # Do not expose model-produced reasoning as a public response.
            return {"evidence_sufficient": decision.sufficient,
                    "evidence_reason": "Evidence was assessed as insufficient." if not decision.sufficient else ""}
        except Exception:
            logger.warning("Evidence grading failed; refusing unsupported generation")
            return {"evidence_sufficient": False,
                    "evidence_reason": "Supporting evidence could not be verified."}

    def rewrite(self, state: AgentState) -> dict:
        if state["retry_count"] >= MAX_RETRIES:
            return {"rewrite_available": False}
        try:
            decision = RewriteDecision.model_validate(self.decisions.rewrite(
                state["resolved_question"], state["current_query"], state["attempted_queries"]))
            query = decision.query.strip()
            previous = {normalize_query(q) for q in state["attempted_queries"]}
            if not normalize_query(query) or normalize_query(query) in previous:
                return {"rewrite_available": False}
            return {"current_query": query, "retry_count": state["retry_count"] + 1,
                    "rewrite_available": True}
        except Exception:
            logger.warning("Query rewriting failed; ending evidence search")
            return {"rewrite_available": False}

    def generate(self, state: AgentState) -> dict:
        try:
            result = self.generator(question=state["resolved_question"],
                                    retrieved_docs=state["reranked_documents"])
            if not isinstance(result["answer"], str) or not result["answer"].strip():
                raise ValueError("Empty model response")
            citations = evaluate_citation_validity(result["answer"], result["sources"])
            if not citations["has_citations"] or citations["invalid_citations"]:
                raise ValueError("Answer citations do not match retrieved sources")
        except Exception:
            logger.error("Grounded answer generation failed")
            raise WorkflowUnavailable("Answer generation is temporarily unavailable") from None
        return {"answer": result["answer"], "sources": result["sources"], "status": "answered",
                "escalation_recommended": False, "escalation_reason": None}

    def escalate(self, state: AgentState) -> dict:
        reason = state.get("evidence_reason") or "The available knowledge does not establish a resolution."
        return {"answer": "I could not verify enough knowledge-base evidence to answer safely. "
                "I recommend contacting NexaDesk support with the issue details and any error "
                "message. No support ticket has been created.", "sources": [],
                "status": "escalated", "escalation_recommended": True, "escalation_reason": reason}
