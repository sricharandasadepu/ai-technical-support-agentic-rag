import re

from langchain_core.documents import Document
from rank_bm25 import BM25Okapi


class BM25Retriever:

    def __init__(self, documents: list[Document]):

        self.documents = documents

        # Convert each document into a list of tokens.
        tokenized_corpus = [
            self._tokenize(doc.page_content)
            for doc in documents
        ]

        # Build the BM25 keyword-search index.
        self.bm25 = BM25Okapi(tokenized_corpus)

    @staticmethod
    def _tokenize(text: str) -> list[str]:

        stopwords = {
            "a", "an", "the", "is", "are", "was", "were",
            "how", "do", "does", "i", "my", "me", "to",
            "of", "in", "on", "for", "and", "or", "it",
            "can", "you", "what", "why"
        }

        tokens = re.findall(
            r"[a-z0-9]+(?:[-_.][a-z0-9]+)*",
            text.lower()
        )

        return [
            token
            for token in tokens
            if token not in stopwords
        ]
    def search(self, query: str, top_k: int = 3) -> list[Document]:

        if top_k < 1:
            raise ValueError("top_k must be at least 1")

        # Tokenize the user query.
        query_tokens = self._tokenize(query)

        # Calculate BM25 relevance scores.
        scores = self.bm25.get_scores(query_tokens)

        # Sort document positions by score (highest first).
        ranked_indices = sorted(
            range(len(scores)),
            key=lambda i: scores[i],
            reverse=True
        )

        results = []

        for index in ranked_indices[:top_k]:

            # Ignore documents with no positive keyword evidence.
            if scores[index] <= 0:
                continue

            document = self.documents[index]

            # Preserve original metadata without modifying the source.
            metadata = {
                **document.metadata,
                "bm25_score": float(scores[index])
            }

            results.append(
                Document(
                    page_content=document.page_content,
                    metadata=metadata
                )
            )

        return results