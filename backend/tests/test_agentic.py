from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from langchain_core.documents import Document

from app.rag.agentic.graph import build_graph
from app.rag.agentic.nodes import AgentNodes, WorkflowUnavailable
from app.rag.agentic.policies import EvidenceDecision, IntentDecision, RetrievalPolicy, RewriteDecision, LLMDecisions


@pytest.fixture
def workflow():
    docs = [Document(page_content="Documented resolution: synchronize host time.",
                     metadata={"source": "faq.json", "chunk_id": "abc"})]
    hybrid = Mock()
    hybrid.search.return_value = docs
    reranker = Mock()
    reranker.rerank.return_value = docs
    decisions = Mock()
    decisions.classify.return_value = IntentDecision(intent="technical_support", standalone_question="Fix login failure")
    decisions.grade.return_value = EvidenceDecision(sufficient=True, reason="Documented steps")
    decisions.rewrite.return_value = RewriteDecision(query="NexaDesk login clock synchronization")
    generator = Mock(return_value={"answer": "Synchronize host time [Source 1].", "sources": [
        {"citation": "[Source 1]", "source": "faq.json", "chunk_id": "abc", "ticket_id": None}]})
    nodes = AgentNodes(hybrid, reranker, decisions, generator=generator)
    return SimpleNamespace(graph=build_graph(nodes), nodes=nodes, hybrid=hybrid,
                           reranker=reranker, decisions=decisions, generator=generator)


def run(workflow, question="Fix login failure", history=None):
    return workflow.graph.invoke({"original_question": question, "current_query": question,
        "history": history or [], "retry_count": 0, "attempted_queries": []},
        config={"recursion_limit": 24})


@pytest.mark.parametrize("intent,status", [("greeting", "greeting"),
    ("needs_clarification", "clarification"), ("out_of_scope", "out_of_scope")])
def test_non_support_routing(workflow, intent, status):
    workflow.decisions.classify.return_value = IntentDecision(intent=intent, standalone_question="Hello")
    result = run(workflow)
    assert result["status"] == status
    assert result["sources"] == []
    assert not result["escalation_recommended"]
    workflow.hybrid.search.assert_not_called()
    workflow.generator.assert_not_called()


def test_success_reuses_retriever_reranker_generator(workflow):
    result = run(workflow)
    assert result["status"] == "answered"
    assert result["sources"][0]["chunk_id"] == "abc"
    workflow.hybrid.search.assert_called_once_with("Fix login failure", top_k=10, candidate_k=10)
    workflow.reranker.rerank.assert_called_once()
    workflow.generator.assert_called_once()
    assert result["retry_count"] == 0


def test_two_additional_attempts_then_escalation(workflow):
    workflow.decisions.grade.return_value = EvidenceDecision(sufficient=False, reason="Not documented")
    workflow.decisions.rewrite.side_effect = [RewriteDecision(query="clock drift login"), RewriteDecision(query="OAuth NTP host")]
    result = run(workflow)
    assert workflow.hybrid.search.call_count == 3
    assert workflow.decisions.rewrite.call_count == 2
    assert result["retry_count"] == 2
    assert result["status"] == "escalated" and result["escalation_recommended"]
    assert result["escalation_reason"]
    assert "No support ticket has been created" in result["answer"]
    workflow.generator.assert_not_called()


def test_rewrite_can_recover(workflow):
    workflow.decisions.grade.side_effect = [EvidenceDecision(sufficient=False, reason="Missing"),
                                          EvidenceDecision(sufficient=True, reason="Present")]
    result = run(workflow)
    assert result["status"] == "answered"
    assert workflow.hybrid.search.call_count == 2


def test_duplicate_query_terminates(workflow):
    workflow.decisions.grade.return_value = EvidenceDecision(sufficient=False, reason="Missing")
    workflow.decisions.rewrite.return_value = RewriteDecision(query=" FIX  LOGIN FAILURE? ")
    result = run(workflow)
    assert workflow.hybrid.search.call_count == 1
    assert result["status"] == "escalated"


def test_repeated_earlier_query_terminates(workflow):
    workflow.decisions.grade.return_value = EvidenceDecision(sufficient=False, reason="Missing")
    workflow.decisions.rewrite.side_effect = [RewriteDecision(query="different query"), RewriteDecision(query="Fix login failure")]
    assert run(workflow)["status"] == "escalated"
    assert workflow.hybrid.search.call_count == 2


def test_classification_failure_requests_clarification(workflow):
    workflow.decisions.classify.side_effect = ValueError("bad output")
    assert run(workflow)["status"] == "clarification"
    workflow.hybrid.search.assert_not_called()


def test_invalid_classification_is_validated(workflow):
    workflow.decisions.classify.return_value = {"intent": "unsafe", "standalone_question": "question"}
    assert run(workflow)["status"] == "clarification"


def test_empty_evidence_never_generates(workflow):
    workflow.reranker.rerank.return_value = []
    workflow.decisions.rewrite.side_effect = ValueError("unavailable")
    assert run(workflow)["status"] == "escalated"
    workflow.decisions.grade.assert_not_called()
    workflow.generator.assert_not_called()


def test_invalid_evidence_is_conservative(workflow):
    workflow.decisions.grade.return_value = {"sufficient": "true", "reason": "invalid boolean"}
    workflow.decisions.rewrite.side_effect = ValueError("unavailable")
    assert run(workflow)["status"] == "escalated"
    workflow.generator.assert_not_called()


@pytest.mark.parametrize("component", ["retrieval", "reranking", "generation"])
def test_operational_failures_are_not_knowledge_escalations(workflow, component):
    target = {"retrieval": workflow.hybrid.search, "reranking": workflow.reranker.rerank,
              "generation": workflow.generator}[component]
    target.side_effect = RuntimeError("secret-provider-error")
    with pytest.raises(WorkflowUnavailable) as caught:
        run(workflow)
    assert "secret-provider-error" not in str(caught.value)


def test_history_resolves_followup_without_generation_history(workflow):
    history = [{"role": "user", "content": "OAuth login fails after restore"}]
    workflow.decisions.classify.return_value = IntentDecision(intent="technical_support", standalone_question="How to fix OAuth login after restore?")
    run(workflow, "How do I fix it?", history)
    workflow.decisions.classify.assert_called_once_with("How do I fix it?", history)
    assert workflow.generator.call_args.kwargs["question"] == "How to fix OAuth login after restore?"
    assert "history" not in workflow.generator.call_args.kwargs


def test_candidate_limits():
    with pytest.raises(ValueError):
        RetrievalPolicy(retrieval_k=11, candidate_k=10)


def test_decisions_use_validated_structured_outputs():
    llm = Mock()
    runnable = Mock()
    runnable.invoke.return_value = {"intent": "greeting", "standalone_question": "Hello"}
    llm.with_structured_output.return_value = runnable
    decisions = LLMDecisions(llm)
    assert decisions.classify("Hello", []).intent == "greeting"
    assert llm.with_structured_output.call_count == 3
    assert "untrusted" in runnable.invoke.call_args.args[0][0][1]


@pytest.mark.parametrize("answer", ["Uncited answer", "Unsupported reference [Source 9]."])
def test_invalid_generation_citations_are_rejected(workflow, answer):
    workflow.generator.return_value["answer"] = answer
    with pytest.raises(WorkflowUnavailable):
        run(workflow)
