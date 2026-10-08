import numpy as np


def precision_at_k(
    retrieved_ids: list[str],
    relevant_ids: set[str],
    k: int
) -> float:

    if k < 1:
        raise ValueError("k must be at least 1")

    top_k_ids = retrieved_ids[:k]

    relevant_retrieved = len(
        set(top_k_ids) & relevant_ids
    )

    return relevant_retrieved / k


def recall_at_k(
    retrieved_ids: list[str],
    relevant_ids: set[str],
    k: int
) -> float:

    if k < 1:
        raise ValueError("k must be at least 1")

    if not relevant_ids:
        return 0.0

    top_k_ids = retrieved_ids[:k]

    relevant_retrieved = len(
        set(top_k_ids) & relevant_ids
    )

    return relevant_retrieved / len(relevant_ids)


def reciprocal_rank(
    retrieved_ids: list[str],
    relevant_ids: set[str]
) -> float:

    for rank, chunk_id in enumerate(retrieved_ids, start=1):

        if chunk_id in relevant_ids:
            return 1.0 / rank

    return 0.0