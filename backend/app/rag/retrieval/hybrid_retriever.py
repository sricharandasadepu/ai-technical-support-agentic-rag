from langchain_core.documents import Document


class HybridRetriever:

    def __init__(
        self,
        embedding_service,
        pinecone_store,
        bm25_retriever,
        rrf_k: int = 60
    ):
        self.embedding_service = embedding_service
        self.pinecone_store = pinecone_store
        self.bm25_retriever = bm25_retriever
        self.rrf_k = rrf_k

    def search(
        self,
        query: str,
        top_k: int = 3,
        candidate_k: int = 10
    ) -> list[Document]:

        if top_k < 1 or candidate_k < top_k:
            raise ValueError(
                "top_k must be positive and candidate_k >= top_k"
            )

        # 1. Generate the query embedding.
        query_embedding = self.embedding_service.embed_query(query)

        # 2. Retrieve candidates using Pinecone.
        dense_results = self.pinecone_store.similarity_search(
            query_embedding=query_embedding,
            top_k=candidate_k
        )

        # 3. Retrieve candidates using BM25.
        sparse_results = self.bm25_retriever.search(
            query=query,
            top_k=candidate_k
        )

        # 4. Combine rankings using RRF.
        scores = {}
        documents = {}

        for results in [dense_results, sparse_results]:

            for rank, document in enumerate(results, start=1):

                chunk_id = document.metadata["chunk_id"]

                scores[chunk_id] = (
                    scores.get(chunk_id, 0.0)
                    + 1.0 / (self.rrf_k + rank)
                )

                # Store a copy to avoid changing source metadata.
                if chunk_id not in documents:
                    documents[chunk_id] = document

        # 5. Sort by combined RRF score.
        ranked_ids = sorted(
            scores,
            key=lambda chunk_id: scores[chunk_id],
            reverse=True
        )

        # 6. Return the final top-k documents.
        final_results = []

        for chunk_id in ranked_ids[:top_k]:

            document = documents[chunk_id]

            metadata = {
                **document.metadata,
                "rrf_score": scores[chunk_id]
            }

            final_results.append(
                Document(
                    page_content=document.page_content,
                    metadata=metadata
                )
            )

        return final_results