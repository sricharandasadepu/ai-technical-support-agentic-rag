"""No credentials, network services or model downloads are needed by these tests."""
import os

# Set explicit dummy values before app imports. Existing .env secrets are never used.
for name, value in {
    "MONGODB_URI": "mongodb://localhost:27017",
    "JWT_SECRET_KEY": "test-only-secret-key-with-at-least-32-characters",
    "AZURE_STORAGE_CONNECTION_STRING": "test-only",
    "AZURE_STORAGE_CONTAINER_NAME": "test-only",
    "PINECONE_API_KEY": "test-only",
    "PINECONE_INDEX_NAME": "test-only",
    "GROQ_API_KEY": "test-only",
    "GROQ_MODEL": "test-only",
    "RAG_CORPUS_PATH": "notebooks/retrieval_evaluation_data.json",
    "RAG_RETRIEVAL_K": "10", "RAG_CANDIDATE_K": "10", "RAG_FINAL_K": "5",
    "CONVERSATION_HISTORY_TURNS": "3",
    "GROQ_TIMEOUT_SECONDS": "30",
    "RAG_INITIALIZATION_RETRY_SECONDS": "60",
}.items():
    os.environ[name] = value
