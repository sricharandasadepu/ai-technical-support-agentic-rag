import logging
import re

from langchain_core.documents import Document

logger = logging.getLogger(__name__)


class DocumentCleaner:

    @staticmethod
    def _normalize_value(value: str | None) -> str:
        """Remove extra whitespace without changing meaningful text."""

        if value is None:
            return ""

        return " ".join(str(value).split())


    def _clean_metadata(self, metadata: dict) -> dict:
        """Normalize metadata values used for filtering and citations."""

        cleaned = metadata.copy()

        for key, value in cleaned.items():
            if isinstance(value, str):
                cleaned[key] = self._normalize_value(value)

        for key in ("error_code", "ticket_id"):
            if cleaned.get(key):
                cleaned[key] = cleaned[key].upper()

        for key in ("topic", "status", "priority"):
            if cleaned.get(key):
                cleaned[key] = cleaned[key].lower()

        return cleaned


    def _clean_content(self, content: str, metadata: dict) -> str:
        """Clean text and synchronize important identifiers."""

        lines = []

        for line in content.splitlines():
            normalized = line.strip()

            if normalized:
                lines.append(normalized)

        cleaned_text = "\n".join(lines)

        replacements = {
            "Ticket ID": "ticket_id",
            "Error Code": "error_code",
        }

        for label, key in replacements.items():

            value = metadata.get(key)

            if not value:
                continue

            pattern = rf"(?m)^{re.escape(label)}:\s*.*$"

            cleaned_text = re.sub(
                pattern,
                lambda match, label=label, value=value: f"{label}: {value}",
                cleaned_text
            )

        return cleaned_text


    def _deduplicate(self, documents: list[Document]) -> list[Document]:
        """Remove duplicate logical records using normalized identifiers."""

        seen = set()
        unique_documents = []

        for document in documents:

            metadata = document.metadata
            document_type = metadata.get("document_type")

            if document_type == "support_ticket":
                record_id = metadata.get("ticket_id")

            elif document_type == "known_issue":
                record_id = metadata.get("error_code")

            else:
                record_id = None

            if record_id:
                key = (document_type, record_id)
            else:
                key = (
                    metadata.get("source"),
                    metadata.get("page"),
                    document.page_content
                )

            if key in seen:
                logger.warning(
                    "Duplicate document skipped: %s",
                    key
                )
                continue

            seen.add(key)
            unique_documents.append(document)

        return unique_documents


    def clean(self, documents: list[Document]) -> list[Document]:
        """Public method for cleaning and deduplicating Documents."""

        cleaned_documents = []

        for document in documents:

            metadata = self._clean_metadata(document.metadata)

            content = self._clean_content(
                document.page_content,
                metadata
            )

            if not content:
                logger.warning(
                    "Empty document skipped: %s",
                    metadata.get("source")
                )
                continue

            cleaned_documents.append(
                Document(
                    page_content=content,
                    metadata=metadata
                )
            )

        unique_documents = self._deduplicate(cleaned_documents)

        logger.info(
            "Cleaning complete: %d input → %d output Documents.",
            len(documents),
            len(unique_documents)
        )

        return unique_documents


document_cleaner = DocumentCleaner()