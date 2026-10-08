import json

from langchain_core.prompts import ChatPromptTemplate
from app.rag.generation.llm_service import get_llm


def evaluate_faithfulness(answer: str, context: str) -> dict:
    """
    Evaluate whether factual claims in the generated
    answer are supported by retrieved context.
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
You are an impartial RAG evaluation assistant.

Evaluate the generated answer using ONLY the retrieved context.

Instructions:
1. Break the generated answer into atomic factual claims.
2. Check whether each claim is supported by the context.
3. Do not use your own knowledge to justify claims.
4. Mark a claim as supported only when evidence is present.
5. Treat unsupported numerical thresholds and guaranteed
   outcomes as unsupported claims.
6. Return ONLY valid JSON in this structure:

{{
  "claims": [
    {{
      "claim": "Example factual claim",
      "supported": true,
      "reason": "Evidence from the context"
    }}
  ]
}}
"""),
        ("human", """
Retrieved context:
{context}

Generated answer:
{answer}
""")
    ])

    llm = get_llm()

    response = llm.invoke(
        prompt.format_messages(
            context=context,
            answer=answer
        )
    )

    # Parse the evaluator's JSON response
    evaluation = json.loads(response.content)

    claims = evaluation["claims"]

    supported_count = sum(
        1 for claim in claims if claim["supported"]
    )

    total_claims = len(claims)

    faithfulness = (
        supported_count / total_claims
        if total_claims > 0
        else None
    )

    return {
        "faithfulness": faithfulness,
        "supported_claims": supported_count,
        "total_claims": total_claims,
        "claims": claims
    }



def evaluate_answer_relevance(question: str, answer: str) -> dict:
    """
    Evaluate how directly the generated answer
    addresses the user's question.
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
You are an impartial RAG answer relevance evaluator.

Evaluate whether the generated answer addresses the user question.

Scoring:
1.0 = Directly answers the question.
0.5 = Partially answers the question.
0.0 = Does not answer the question.

Evaluate relevance only, not factual correctness or faithfulness.

Return ONLY valid JSON:
{{
    "score": 1.0,
    "reason": "Brief explanation"
}}
"""),
        ("human", """
Question:
{question}

Generated answer:
{answer}
""")
    ])

    llm = get_llm()

    response = llm.invoke(
        prompt.format_messages(
            question=question,
            answer=answer
        )
    )

    evaluation = json.loads(response.content)

    return {
        "answer_relevance": evaluation["score"],
        "reason": evaluation["reason"]
    }

def evaluate_answer_correctness(
    question: str,
    reference_answer: str,
    generated_answer: str
) -> dict:
    """
    Evaluate whether the generated answer matches
    the verified reference answer.
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
You are an impartial RAG answer correctness evaluator.

Compare the generated answer with the reference answer.

Instructions:
1. Check whether the generated answer contains the
   essential facts from the reference answer.
2. Identify missing facts and contradictions.
3. Do not penalize additional information merely because
   it is absent from the reference answer.
4. Do not assume that unsupported additional information
   is correct; faithfulness evaluates its evidence separately.

Scoring:
1.0 = All essential facts are correct with no material contradictions.
0.5 = Partially correct or missing important information.
0.0 = Incorrect or contradicts the reference answer.

Return ONLY valid JSON:
{{
    "score": 1.0,
    "reason": "Brief explanation"
}}
"""),
        ("human", """
Question:
{question}

Reference answer:
{reference_answer}

Generated answer:
{generated_answer}
""")
    ])

    llm = get_llm()

    response = llm.invoke(
        prompt.format_messages(
            question=question,
            reference_answer=reference_answer,
            generated_answer=generated_answer
        )
    )

    evaluation = json.loads(response.content)

    return {
        "answer_correctness": evaluation["score"],
        "reason": evaluation["reason"]
    }

import re


def evaluate_citation_validity(
    answer: str,
    sources: list[dict]
) -> dict:
    """
    Check whether citation identifiers in the generated
    answer correspond to retrieved sources.
    """

    # Supports [Source 1] and 【Source 1】
    cited_numbers = re.findall(
        r"(?:\[|【)\s*Source\s*(\d+)\s*(?:\]|】)",
        answer,
        flags=re.IGNORECASE
    )

    cited_ids = {
        f"[Source {number}]"
        for number in cited_numbers
    }

    valid_ids = {
        source["citation"]
        for source in sources
    }

    valid_citations = cited_ids & valid_ids
    invalid_citations = cited_ids - valid_ids

    score = (
        len(valid_citations) / len(cited_ids)
        if cited_ids else 0.0
    )

    return {
        "citation_validity": score,
        "cited_sources": sorted(cited_ids),
        "valid_citations": sorted(valid_citations),
        "invalid_citations": sorted(invalid_citations),
        "has_citations": bool(cited_ids)
    }

def evaluate_generation(
    question: str,
    reference_answer: str,
    generated_answer: str,
    context: str,
    sources: list[dict]
) -> dict:
    """
    Evaluate a RAG-generated answer using four metrics.
    """

    # 1. Faithfulness
    faithfulness = evaluate_faithfulness(
        answer=generated_answer,
        context=context
    )

    # 2. Answer relevance
    relevance = evaluate_answer_relevance(
        question=question,
        answer=generated_answer
    )

    # 3. Answer correctness
    correctness = evaluate_answer_correctness(
        question=question,
        reference_answer=reference_answer,
        generated_answer=generated_answer
    )

    # 4. Citation identifier validity
    citations = evaluate_citation_validity(
        answer=generated_answer,
        sources=sources
    )

    return {
        "question": question,
        "faithfulness": faithfulness["faithfulness"],
        "answer_relevance": relevance["answer_relevance"],
        "answer_correctness": correctness["answer_correctness"],
        "citation_validity": citations["citation_validity"],
        "faithfulness_details": faithfulness,
        "relevance_details": relevance,
        "correctness_details": correctness,
        "citation_details": citations
    }