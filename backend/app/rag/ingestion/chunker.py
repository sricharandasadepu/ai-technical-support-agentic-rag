import logging
import re
import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)


class DocumentChunker:

    def __init__(self):

        self.max_section_size = 900

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.max_section_size,
            chunk_overlap=100,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def _split_if_needed(self,document: Document) -> list[Document]:

        if len(document.page_content) <= self.max_section_size : return [document]
         
        return self.splitter.split_documents([document])    

    def _preserve_structured_record(self,document: Document) -> list[Document]:
        return [document]

    def _split_pdf_sections(self, document: Document) -> list[Document]:

        text = document.page_content

        # Split at numbered headings: 1. OAuth, 2. API, etc.
        sections = re.split(
            r"(?m)(?=^\d+\.\s+[A-Z])",
            text
        )

        sections = [
            section.strip()
            for section in sections
            if section.strip()
        ]

        # If headings are not found, use recursive fallback.
        if len(sections) <= 1:
            return self._split_if_needed(document)

        # First section contains the document title and version.
        document_header = sections[0]
        technical_sections = sections[1:]

        chunks = []

        for index, section in enumerate(technical_sections, start=1):

            chunk_content = f"{document_header}\n\n{section}"

            section_document = Document(
                page_content=chunk_content,
                metadata={
                    **document.metadata,
                    "section_number": index,
                    "section_title": section.splitlines()[0],
                }
            )

            # Split only if a section exceeds our size limit.
            chunks.extend(
                self._split_if_needed(section_document)
            )

        logger.info(
            "Split PDF into %d chunks: %s",
            len(chunks),
            document.metadata.get("source")
        )

        return chunks


    def _split_docx_sections(self, document: Document) -> list[Document]:

        text = document.page_content

        section_headings = [
            "OAuth Authentication Failures",
            "HTTP 429 / API Throttling",
            "Webhook Delivery Failures",
            "Duplicate Ticket Notifications",
            "Delayed Ticket Search",
        ]

        lines = text.splitlines()

        header_lines = []
        sections = []
        current_section = []
        current_title = None

        for line in lines:

            stripped_line = line.strip()

            if stripped_line in section_headings:

                # Save the previous section before starting another.
                if current_section:
                    sections.append(
                        (current_title, "\n".join(current_section))
                    )

                current_title = stripped_line
                current_section = [stripped_line]

            elif current_title is None:
                # Document introduction before the first topic.
                header_lines.append(stripped_line)

            else:
                current_section.append(stripped_line)

        # Save the final section.
        if current_section:
            sections.append(
                (current_title, "\n".join(current_section))
            )

        # Fallback if no recognized headings were found.
        if not sections:
            return self._split_if_needed(document)

        document_header = "\n".join(
            line for line in header_lines if line
        )

        chunks = []

        for index, (title, content) in enumerate(sections, start=1):

            chunk_content = (
                f"{document_header}\n\n{content}"
                if document_header
                else content
            )

            section_document = Document(
                page_content=chunk_content,
                metadata={
                    **document.metadata,
                    "section_number": index,
                    "section_title": title,
                }
            )

            chunks.extend(
                self._split_if_needed(section_document)
            )

        logger.info(
            "Split DOCX into %d chunks: %s",
            len(chunks),
            document.metadata.get("source")
        )

        return chunks    


    def chunk(self, documents: list[Document]) -> list[Document]:

        all_chunks = []

        for document in documents:

            doc_type = document.metadata.get("document_type")

            if doc_type in ["support_ticket", "known_issue"]:

                chunks = self._preserve_structured_record(document)

            elif doc_type == "product_documentation":

                chunks = self._split_pdf_sections(document)

            elif doc_type == "troubleshooting_manual":

                chunks = self._split_docx_sections(document)

            elif doc_type in ["release_notes", "incident_report"]:

                # Preserve these short documents as complete units.
                chunks = [document]

            else:

                # Fallback for unrecognized document types.
                logger.warning(
                    "Unknown document type: %s. Using recursive splitting.",
                    doc_type
                )

                chunks = self._split_if_needed(document)

            for chunk in chunks:
                chunk.metadata["chunk_id"] = self._generate_chunk_id(chunk)

            all_chunks.extend(chunks)

        logger.info(
            "Chunking completed: %d documents -> %d chunks",
            len(documents),
            len(all_chunks)
        )

        return all_chunks


    def _generate_chunk_id(self, document: Document) -> str:

        metadata = document.metadata

        # Build a unique identity using source, metadata and content.
        identity = "|".join([
            str(metadata.get("source", "")),
            str(metadata.get("document_type", "")),
            str(metadata.get("ticket_id", "")),
            str(metadata.get("error_code", "")),
            str(metadata.get("section_number", "")),
            document.page_content
        ])

        # Generate a deterministic SHA-256 hash.
        chunk_id = hashlib.sha256(
            identity.encode("utf-8")
        ).hexdigest()

        return chunk_id    