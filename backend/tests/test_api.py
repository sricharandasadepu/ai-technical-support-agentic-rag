from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import threading

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import PyMongoError

from app.core.security import create_access_token
from app.db.mongodb import mongodb
from app.main import app
from app.rag.agentic.nodes import WorkflowUnavailable
from app.routers.rag import get_agentic_service
from app.services.agentic_rag_service import AgenticRAGService
from app.services.conversation_service import ConversationService
from tests.fakes import FakeDatabase


@pytest.fixture
def api(monkeypatch):
    database = FakeDatabase()
    database["users"].documents = {
        "owner-a": {"_id": "owner-a", "email": "a@example.com", "name": "Owner A"},
        "owner-b": {"_id": "owner-b", "email": "b@example.com", "name": "Owner B"},
    }
    monkeypatch.setattr(mongodb, "database", database)
    graph = Mock()
    graph.invoke.return_value = {"answer": "Use documented steps [Source 1].", "sources": [
        {"citation": "[Source 1]", "source": "guide.pdf", "chunk_id": "chunk-1", "ticket_id": None}],
        "status": "answered", "escalation_recommended": False, "escalation_reason": None,
        "internal_secret": "never-return-this"}
    manager = Mock()
    manager.get.return_value = SimpleNamespace(graph=graph)
    service = AgenticRAGService(manager)
    app.dependency_overrides[get_agentic_service] = lambda: service
    # No TestClient lifespan: external MongoDB/model initialization is not invoked.
    client = TestClient(app)
    result = SimpleNamespace(client=client, database=database, graph=graph, manager=manager,
        service=service, a={"Authorization": "Bearer " + create_access_token("a@example.com")},
        b={"Authorization": "Bearer " + create_access_token("b@example.com")})
    yield result
    client.close()
    app.dependency_overrides.clear()


def send(api, **kwargs):
    return api.client.post("/rag/chat", headers=api.a, json={"message": "Fix NexaDesk login", **kwargs})


def test_authenticated_chat_and_atomic_history(api):
    response = send(api)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "answered"
    assert set(result) == {"answer", "sources", "conversation_id", "status", "escalation_recommended", "escalation_reason"}
    assert "internal_secret" not in response.text
    history = api.client.get(f"/rag/conversations/{result['conversation_id']}", headers=api.a)
    assert history.status_code == 200
    assert [m["role"] for m in history.json()["messages"]] == ["user", "assistant"]
    assert history.json()["messages"][1]["sources"] == result["sources"]
    assert history.json()["total_turns"] == 1


@pytest.mark.parametrize("route", ["/rag/chat", "/rag/conversations", "/rag/conversations/12345678-1234-1234-1234-123456789abc"])
def test_missing_auth_rejected(api, route):
    response = api.client.post(route, json={"message": "Hello"}) if route == "/rag/chat" else api.client.get(route)
    assert response.status_code in (401, 403)
    api.graph.invoke.assert_not_called()


@pytest.mark.parametrize("token", ["broken-token", "expired", "unknown"])
def test_invalid_expired_unknown_user_rejected(api, token):
    if token == "expired":
        token = create_access_token("a@example.com", expires_minutes=-1)
    elif token == "unknown":
        token = create_access_token("unknown@example.com")
    response = api.client.post("/rag/chat", headers={"Authorization": "Bearer " + token}, json={"message": "Hello"})
    assert response.status_code == 401


def test_ownership_read_append_and_list(api):
    conversation_id = send(api).json()["conversation_id"]
    route = f"/rag/conversations/{conversation_id}"
    assert api.client.get(route, headers=api.b).status_code == 404
    assert api.client.post("/rag/chat", headers=api.b, json={"message": "Another question", "conversation_id": conversation_id}).status_code == 404
    assert api.client.get("/rag/conversations", headers=api.b).json()["conversations"] == []
    own = api.client.get("/rag/conversations", headers=api.a).json()
    assert own["conversations"][0]["conversation_id"] == conversation_id
    assert "owner_id" not in str(own) and "turns" not in own["conversations"][0]
    assert api.graph.invoke.call_count == 1


def test_resume_passes_bounded_context(api):
    conversation_id = send(api).json()["conversation_id"]
    response = send(api, message="What should I check next?", conversation_id=conversation_id)
    assert response.status_code == 200
    assert response.json()["conversation_id"] == conversation_id
    state = api.graph.invoke.call_args.args[0]
    assert [m["role"] for m in state["history"]] == ["user", "assistant"]
    assert "owner_id" not in state
    history = api.client.get(f"/rag/conversations/{conversation_id}?offset=1&limit=1", headers=api.a).json()
    assert history["total_turns"] == 2 and len(history["messages"]) == 2


@pytest.mark.parametrize("body", [{"message": " "}, {"message": "x" * 4001},
    {"message": "hello", "conversation_id": "invalid"}, {"message": "hello", "secret": "unknown"}])
def test_input_validation(api, body):
    assert api.client.post("/rag/chat", headers=api.a, json=body).status_code == 422
    api.graph.invoke.assert_not_called()


def test_initialization_failure_returns_safe_503(api):
    api.manager.get.side_effect = WorkflowUnavailable("private-details")
    response = send(api)
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "10"
    assert "private-details" not in response.text
    assert next(iter(api.database["conversations"].documents.values()))["turns"] == []


def test_graph_failure_returns_safe_503(api):
    api.graph.invoke.side_effect = RuntimeError("api-key-private-details")
    response = send(api)
    assert response.status_code == 503
    assert "api-key-private-details" not in response.text


def test_storage_failure_returns_safe_503(api):
    api.database["conversations"].insert_one = AsyncMock(side_effect=PyMongoError("private-mongodb-uri"))
    response = send(api)
    assert response.status_code == 503
    assert "private-mongodb-uri" not in response.text
    api.graph.invoke.assert_not_called()


def test_authentication_database_failure_returns_safe_503(api):
    api.database["users"].find_one = AsyncMock(side_effect=PyMongoError("private-mongodb-uri"))
    response = send(api)
    assert response.status_code == 503
    assert "private-mongodb-uri" not in response.text
    api.graph.invoke.assert_not_called()


def test_invalid_workflow_result_is_not_persisted(api):
    api.graph.invoke.return_value["status"] = "invalid-status"
    assert send(api).status_code == 503
    assert next(iter(api.database["conversations"].documents.values()))["turns"] == []


def test_busy_inference_fails_fast(api):
    api.service._execution_lock.acquire()
    try:
        assert send(api).status_code == 503
    finally:
        api.service._execution_lock.release()
    api.graph.invoke.assert_not_called()


def test_inference_runs_off_the_event_loop(api):
    threads = {}
    original_chat = api.service.chat
    result = api.graph.invoke.return_value

    async def capture_chat(*args, **kwargs):
        threads["event_loop"] = threading.get_ident()
        return await original_chat(*args, **kwargs)

    def capture_graph(*args, **kwargs):
        threads["inference"] = threading.get_ident()
        return result

    api.service.chat = capture_chat
    api.graph.invoke.side_effect = capture_graph
    assert send(api).status_code == 200
    assert threads["event_loop"] != threads["inference"]


def test_existing_health_and_auth_me(api):
    assert api.client.get("/health").status_code == 200
    assert api.client.get("/auth/me", headers=api.a).json() == {"name": "Owner A", "email": "a@example.com"}


@pytest.mark.asyncio
async def test_atomic_turn_conflict(api):
    from app.services.conversation_service import ConversationConflict
    service = ConversationService(api.database)
    conversation = await service.create("owner-a", "Issue")
    result = api.graph.invoke.return_value
    await service.append_turn("owner-a", conversation, "Issue", result)
    with pytest.raises(ConversationConflict):
        await service.append_turn("owner-a", conversation, "Concurrent issue", result)
    assert len(api.database["conversations"].documents[conversation["_id"]]["turns"]) == 1


@pytest.mark.asyncio
async def test_store_write_checks_owner(api):
    from app.services.conversation_service import ConversationConflict
    service = ConversationService(api.database)
    conversation = await service.create("owner-a", "Issue")
    with pytest.raises(ConversationConflict):
        await service.append_turn("owner-b", conversation, "Issue", api.graph.invoke.return_value)
