import logging

import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class EmbeddingService:

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    ):

        self.model = SentenceTransformer(model_name)

        self.dimension = self.model.get_sentence_embedding_dimension()

        logger.info(
            "Embedding model loaded: %s | Dimension: %s",
            model_name,
            self.dimension
        )

    def embed_documents(
        self,
        texts: list[str]
    ) -> np.ndarray:

        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)

        embeddings = self.model.encode(
            texts,
            batch_size=16,
            normalize_embeddings=True,
            show_progress_bar=False
        )

        return embeddings

    def embed_query(
        self,
        query: str
    ) -> np.ndarray:

        embedding = self.model.encode(
            query,
            normalize_embeddings=True
        )

        return embedding