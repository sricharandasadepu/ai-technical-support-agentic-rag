import logging

from langchain_core.documents import Document
from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)


class CrossEncoderReranker:

    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    ):
        self.model = CrossEncoder(model_name)

        logger.info(
            "Cross-encoder reranker loaded: %s",
            model_name
        )

    def rerank(
        self,
        query: str,
        documents: list[Document],
        top_k: int = 3
    ) -> list[Document]:

        if top_k < 1:
            raise ValueError("top_k must be at least 1")

        if not documents:
            return []

        # Create query-document pairs.
        pairs = [
            (query, document.page_content)
            for document in documents
        ]

        # Predict relevance scores.
        scores = self.model.predict(pairs)

        # Attach scores without modifying original documents.
        scored_documents = []

        for document, score in zip(documents, scores):

            metadata = {
                **document.metadata,
                "rerank_score": float(score)
            }

            scored_documents.append(
                Document(
                    page_content=document.page_content,
                    metadata=metadata
                )
            )

        # Sort by cross-encoder score.
        scored_documents.sort(
            key=lambda doc: doc.metadata["rerank_score"],
            reverse=True
        )

        return scored_documents[:top_k]