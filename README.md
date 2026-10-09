# ai-technical-support-agentic-rag
An end-to-end AI Technical Support Resolution Assistant powered by Agentic RAG, hybrid retrieval, reranking, and query correction to deliver accurate, context-aware, and grounded solutions from multi-format technical knowledge sources.

The backend now includes a LangGraph workflow, authenticated chat, and MongoDB conversations.
The existing authentication endpoints and Traditional RAG function remain available.
No frontend, deployment, support-ticket creation, or additional paid service is included.

## Run the backend

Use the existing Conda environment `python_311` (Python 3.11.17). Do not create a
new environment. Its interpreter is
`C:\Users\sri charan\anaconda3\envs\python_311\python.exe`.

From the repository root in PowerShell:

```powershell
conda activate python_311
python -B -m pip check
# If backend/.env does not exist, copy backend/.env.example and supply real values.
# Keep an existing backend/.env; new optional settings already have defaults.
Set-Location backend
python -B -m uvicorn app.main:app --reload
```

If Conda activation is unavailable in the shell, invoke that interpreter directly:

```powershell
Set-Location backend
& 'C:\Users\sri charan\anaconda3\envs\python_311\python.exe' -B -m uvicorn app.main:app --reload
```

All runtime requirements were already installed in this environment. Only the
missing `watchfiles`, `pytest`, `pytest-asyncio`, `iniconfig`, and `pluggy` packages
were installed for reload support and testing. No existing packages were upgraded.
If these additions are missing on another machine with the same environment,
install only those missing packages with its own Python executable; do not
recreate the environment.

Open `http://localhost:8000/docs`. Existing routes are `GET /health`,
`POST /auth/register`, `POST /auth/login`, and `GET /auth/me`.
Authentication still uses the existing bearer JWT and current-user dependency.

MongoDB must be reachable at startup. A compound conversation owner/update-time
index is created using the existing `technical_support_db` connection. ML models,
Pinecone verification, BM25, and the graph initialize lazily in a worker on first
chat, once per process. This avoids making authentication startup depend on
model downloads or Pinecone availability. First chat can be slow while models load.
Use one API worker initially: multiple workers each hold their own ML models.

## Backend structure

```text
backend/
├── .env.example
├── requirements.txt
├── requirements-test.txt
├── pytest.ini
├── app/
│   ├── main.py
│   ├── core/                 # Existing configuration, security, dependencies, logs
│   ├── db/                   # Existing async MongoDB connection
│   ├── routers/
│   │   ├── auth.py           # Existing registration/login/me
│   │   └── rag.py            # Chat and conversation endpoints
│   ├── schemas/
│   │   ├── user.py
│   │   └── rag.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── agentic_rag_service.py
│   │   ├── conversation_service.py
│   │   └── rag_resources.py
│   └── rag/
│       ├── agentic/
│       │   ├── state.py
│       │   ├── nodes.py
│       │   ├── graph.py
│       │   └── policies.py
│       ├── corpus.py
│       ├── ingestion/        # Existing components plus build_corpus.py
│       ├── embeddings/       # Existing components
│       ├── vectorstore/      # Existing components
│       ├── retrieval/        # Existing components
│       ├── generation/       # Existing pipeline; shared, bounded Groq client
│       └── evaluation/       # Existing metrics and generation reference questions
├── notebooks/
│   └── retrieval_evaluation_data.json
└── tests/
    ├── conftest.py
    ├── fakes.py
    ├── test_agentic.py
    ├── test_api.py
    └── test_resources_and_traditional.py
```

## Agentic workflow

```mermaid
flowchart TD
    A[User message and recent conversation] --> B[Structured intent classification]
    B -->|Greeting, ambiguous or unrelated| C[Greeting, clarification or scope response]
    B -->|Technical support| D[Existing dense + BM25 hybrid retrieval]
    D --> E[Existing cross-encoder reranking]
    E --> F[Structured evidence sufficiency grading]
    F -->|Sufficient| G[Existing grounded generation and citations]
    F -->|Insufficient, retries available| H[Structured query rewrite]
    H -->|New query| D
    H -->|Duplicate or failed rewrite| I[Transparent escalation recommendation]
    F -->|Two retries exhausted| I
    G --> J[Owner-scoped atomic conversation turn]
    C --> J
    I --> J
```

Intent, evidence and rewrite outputs use Pydantic schemas through Groq structured
function calling. Failed intent classification requests clarification. Failed
evidence grading never permits generation. Document similarity is not treated as
proof of correctness. Generation retains the existing context builder, grounded
prompt and numbered sources; missing/unknown citation identifiers are rejected.
Citation existence does not independently prove factual support for every claim.

At most three retrieval attempts occur: the original search and two rewritten
searches. Previously attempted queries are compared after case/whitespace/basic
terminal punctuation normalization. A failed/duplicate rewrite terminates.
A recursion limit provides an additional graph execution bound.

The latest three conversation turns, bounded in length, are provided only for
intent/reference resolution. Generation receives a standalone question and retrieved
documents, not historical answers as evidence. History is untrusted and cannot
replace the knowledge-base prompt. This is basic conversational context, not a
durable LangGraph checkpoint system. Raw graph state and grading reasoning are
not stored or exposed. Existing LLM evaluation helpers remain available offline.

## Canonical knowledge corpus

The checked-in `backend/notebooks/retrieval_evaluation_data.json` contains 43
persisted text/metadata chunks and is the default BM25 snapshot. Its evaluation
queries are ignored by initialization. Every chunk ID is checked against the
existing chunker's deterministic identity algorithm.

Before serving RAG, initialization verifies the Pinecone index dimension (384),
the `nexadesk-kb` namespace count, and every chunk's ID, text and citation metadata.
The snapshot is authoritative only when it passes this verification. A mismatch
returns a sanitized HTTP 503; there is no empty-corpus or dense-only fallback.
No Azure download or vector upsert occurs during API startup or chat initialization.

If the Pinecone knowledge base has changed, generate a matching full snapshot
using the existing ingestion components. From `backend/`:

```powershell
python -m app.rag.ingestion.build_corpus --output data/kb_chunks.json
```

This explicit command downloads supported Azure blobs, loads/cleans/chunks them,
validates IDs and writes a versioned JSON snapshot atomically. It does not change
Pinecone. Set `RAG_CORPUS_PATH=data/kb_chunks.json` and restart the backend.
The generated data directory is gitignored because it can contain support data.

Only when intentionally updating the existing knowledge base:

```powershell
python -m app.rag.ingestion.build_corpus --output data/kb_chunks.json --upsert
```

This upserts embeddings into the existing namespace. It never deletes stale
vectors or creates an index. If old vectors remain after source changes, reconcile
the namespace separately before chat initialization can pass its exact membership
check. Pinecone changes may require time to become visible. Back up an existing
snapshot before intentionally replacing it. The original PDF and DOCX loaders use
text extraction; scanned PDFs and DOCX tables do not gain OCR/table support here.

## Chat and conversations

All new endpoints require `Authorization: Bearer <access_token>`.

| Endpoint | Behavior |
|---|---|
| `POST /rag/chat` | Create a conversation or append to an owned conversation |
| `GET /rag/conversations?limit=20&offset=0` | List only the authenticated user's conversations |
| `GET /rag/conversations/{id}?limit=20&offset=0` | Read owned history, paginated by turns |

Obtain a token from the existing JSON login endpoint:

```json
{"email": "user@example.com", "password": "your-password"}
```

First chat request:

```json
{"message": "How do I fix NX-AUTH-4017?"}
```

Illustrative answered response (actual answer, sources and IDs depend on retrieval):

```json
{
  "answer": "Synchronize the application host time and follow the documented resolution [Source 1].",
  "sources": [{
    "citation": "[Source 1]",
    "source": "faq/known_issues.json",
    "chunk_id": "967f29f71425e2767a41f5a1ab68a7b1e0e0573964d559f79bebb20ce0177970",
    "ticket_id": null
  }],
  "conversation_id": "d30a769e-2338-49d7-aea4-2b019d8e46cf",
  "status": "answered",
  "escalation_recommended": false,
  "escalation_reason": null
}
```

Follow-up request uses the returned ID:

```json
{"message": "What should I check after that?", "conversation_id": "d30a769e-2338-49d7-aea4-2b019d8e46cf"}
```

Workflow statuses are `answered`, `clarification`, `greeting`, `out_of_scope`, and
`escalated`. Insufficient evidence produces an escalation recommendation and safe
reason; it explicitly says no ticket was created.

Conversation ownership uses the authenticated MongoDB user ID, never a user ID
supplied in the request. Both nonexistent and foreign conversations return 404.
Successful user/assistant messages are saved as one atomic turn. Optimistic
turn-count checks prevent concurrent writes from silently mixing histories (409).
History/list pagination is bounded; conversations are limited to 100 turns to keep
embedded MongoDB documents bounded. Start a new conversation at that limit.
Failed workflow requests can leave an empty newly created conversation; failed
turns are not recorded as successful responses.

Invalid messages/UUIDs return 422. Missing/invalid/expired bearer tokens follow
the existing auth behavior (401 or the bearer scheme's missing-token response).
Initialization, retrieval, ranking, generation or MongoDB failures return safe 503
responses. Logs exclude provider exception bodies and message content. Local
inference is serialized; a second simultaneous chat request receives 503 with a
retry hint rather than creating an unbounded inference queue. Other routes remain
responsive because blocking RAG work runs in a worker thread.

## Configuration and dependencies

`backend/requirements.txt` is the canonical dependency file; root `requirements.txt`
delegates to it. LangGraph is added and the existing LangChain/Groq dependencies
are pinned to the installed versions verified in `python_311`. Test requirements
are pinned separately. No checkpoint database or additional LLM service is
required. These direct dependency pins are not a complete transitive lockfile.
Check what is installed before installing any missing requirements; do not upgrade
the existing Traditional RAG environment.

Existing settings remain intact. New optional variables are documented in
`backend/.env.example`:

| Variable | Default |
|---|---|
| `GROQ_TIMEOUT_SECONDS` | `30` (one SDK retry per call) |
| `RAG_CORPUS_PATH` | `notebooks/retrieval_evaluation_data.json` |
| `RAG_RETRIEVAL_K` | `10` |
| `RAG_CANDIDATE_K` | `10` |
| `RAG_FINAL_K` | `5` |
| `RAG_INITIALIZATION_RETRY_SECONDS` | `60` |
| `CONVERSATION_HISTORY_TURNS` | `3` |

The invariant is `1 <= final_k <= retrieval_k <= candidate_k <= 100`.
The new graph passes `candidate_k` explicitly, avoiding the existing Traditional
pipeline's implicit candidate limit. That pipeline remains unchanged and supports
its existing defaults; setting its `retrieval_k > 10` still exceeds its default
hybrid candidate limit.

The shared Groq client is cached and has bounded timeouts/retries. After a failed
resource initialization, retries are held off for 60 seconds; configuration/corpus
corrections can take effect on a later initialization attempt (restart for changed
environment values). No new keys are required. Existing authentication has no
tenant/RBAC isolation and the knowledge base remains a shared NexaDesk corpus;
conversation ownership does not create per-tenant document authorization.

## Verification

From the repository root using the existing environment:

```powershell
conda activate python_311
python -B -m pip check
python -B -m pytest -c backend/pytest.ini backend/tests -q
```

Tests mock external services and model calls. They cover intent routes, validated
decisions, hybrid/reranking/generation reuse, bounded retries, duplicate rewrites,
clarification/escalation, provider failures, bearer authentication, conversation
ownership/history/conflicts, resource reuse/recovery, snapshot validation, and
Traditional RAG compatibility. Test settings explicitly replace service credentials
with dummy values. No live Azure/Pinecone/Groq/MongoDB connection is required.

Verification in `python_311`: **54 tests passed**. `pip check` reports no broken
requirements. Backend imports, all 43 deterministic corpus IDs and a real BM25
search were verified. SentenceTransformers, PyTorch, Azure Blob, PDF/DOCX and
embedding/reranker module imports passed. Actual Groq structured-output adapters
were constructed without network calls. Python syntax checks passed. Pytest's temporary-directory
fixtures required access outside the Windows sandbox; the approved rerun passed.
External calls and model inference remain separate live-service checks; the mocked
suite does not claim successful Azure/Pinecone/Groq/MongoDB connectivity.
