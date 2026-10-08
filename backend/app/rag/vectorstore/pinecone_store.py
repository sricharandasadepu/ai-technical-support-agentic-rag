import logging
import numpy as np
from langchain_core.documents import Document

from pinecone import Pinecone

from app.core.config import settings

logger = logging.getLogger(__name__)


class PineconeStore:

    def __init__(self):

        # Initialize the Pinecone client.
        self.client = Pinecone(
            api_key=settings.pinecone_api_key
        )

        # Connect to our existing index.
        self.index = self.client.Index(
            settings.pinecone_index_name
        )

        logger.info(
            "Pinecone client initialized for index: %s",
            settings.pinecone_index_name
        )

    def check_connection(self) -> dict:

        # Fetch index statistics to verify connectivity.
        stats = self.index.describe_index_stats()

        return {
            "dimension": stats.dimension,
            "total_vector_count": stats.total_vector_count,
        }


    def upsert_documents(self, documents: list[Document], embeddings: np.ndarray) -> int:

        if len(documents) != len(embeddings):
            raise ValueError(
                "Number of documents and embeddings must match."
            )

        vectors = []

        for document, embedding in zip(documents, embeddings):

            metadata = {
                **document.metadata,
                "text": document.page_content
            }

            vector = {
                "id": document.metadata["chunk_id"],
                "values": embedding.tolist(),
                "metadata": {
                    key: value
                    for key, value in metadata.items()
                    if value is not None
                }
            }

            vectors.append(vector)

        # Upload vectors in batches.
        batch_size = 20

        for start in range(0, len(vectors), batch_size):

            batch = vectors[start:start + batch_size]

            self.index.upsert(
                vectors=batch,
                namespace="nexadesk-kb"
            )

            logger.info(
                "Upserted %d vectors to Pinecone",
                len(batch)
            )

        return len(vectors)    

    def similarity_search(self, query_embedding: np.ndarray, top_k: int = 3) -> list[Document]:

        if top_k < 1:
            raise ValueError("top_k must be at least 1")

        if len(query_embedding) != 384:
            raise ValueError("Query embedding dimension must be 384")

        results = self.index.query(
            vector=query_embedding.tolist(),
            top_k=top_k,
            include_metadata=True,
            namespace="nexadesk-kb"
        )

        documents = []

        for match in results.matches:

            metadata = dict(match.metadata or {})

            # Extract original text from Pinecone metadata.
            text = metadata.pop("text", "")

            # Add retrieval information.
            metadata["chunk_id"] = match.id
            metadata["similarity_score"] = match.score

            document = Document(
                page_content=text,
                metadata=metadata
            )

            documents.append(document)

        return documents    