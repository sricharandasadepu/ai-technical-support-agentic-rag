from langchain_core.documents import Document


def build_context(documents: list[Document]) -> str:
    """
    Convert retrieved LangChain Documents into
    structured context for LLM generation.
    """

    context_parts = []

    for index, doc in enumerate(documents, start=1):

        metadata = doc.metadata

        source = metadata.get("source", "Unknown")
        ticket_id = metadata.get("ticket_id")
        error_code = metadata.get("error_code")
        section_number = metadata.get("section_number")

        # Each document gets a unique citation label
        lines = [
            f"[Source {index}]",
            f"File: {source}"
        ]

        if ticket_id:
            lines.append(f"Ticket ID: {ticket_id}")

        if error_code:
            lines.append(f"Error Code: {error_code}")

        if section_number is not None:
            lines.append(f"Section: {section_number}")

        lines.append(f"Content:\n{doc.page_content}")

        context_parts.append("\n".join(lines))

    return "\n\n---\n\n".join(context_parts)