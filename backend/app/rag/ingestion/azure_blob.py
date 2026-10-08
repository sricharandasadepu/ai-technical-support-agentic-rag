import logging

from azure.core.exceptions import (
    AzureError,
    ResourceNotFoundError,
)
from azure.storage.blob import BlobServiceClient

from app.core.config import settings


logger = logging.getLogger(__name__)


class AzureBlobService:

    def __init__(self):
        self.blob_service_client = None
        self.container_client = None

        self._connect()


    def _connect(self) -> None:
        try:
            self.blob_service_client = (
                BlobServiceClient.from_connection_string(
                    settings.azure_storage_connection_string
                )
            )

            self.container_client = (
                self.blob_service_client.get_container_client(
                    settings.azure_storage_container_name
                )
            )

            self.container_client.get_container_properties()

            logger.info(
                "Successfully connected to Azure Blob Storage container."
            )

        except ResourceNotFoundError as exc:

            logger.exception(
                "Azure Blob Storage container was not found."
            )

            raise RuntimeError(
                "Azure Blob Storage container was not found."
            ) from exc

        except AzureError as exc:

            logger.exception(
                "Failed to connect to Azure Blob Storage."
            )

            raise RuntimeError(
                "Failed to connect to Azure Blob Storage."
            ) from exc


    def list_blobs(self) -> list[str]:
        try:
            blob_names = list(
                self.container_client.list_blob_names()
            )

            logger.info(
                "Discovered %d blobs in Azure Blob Storage.",
                len(blob_names)
            )

            return blob_names

        except AzureError as exc:

            logger.exception(
                "Failed to list blobs from Azure Blob Storage."
            )

            raise RuntimeError(
                "Failed to list blobs from Azure Blob Storage."
            ) from exc

    def download_blob(self, blob_name: str) -> bytes:
        try:
            blob_client = self.container_client.get_blob_client(
                blob=blob_name
            )

            blob_data = blob_client.download_blob().readall()

            logger.info(
                "Downloaded blob successfully: %s",
                blob_name
            )

            return blob_data

        except ResourceNotFoundError as exc:
            logger.exception(
                "Blob not found: %s",
                blob_name
            )

            raise RuntimeError(
                f"Blob not found: {blob_name}"
            ) from exc

        except AzureError as exc:
            logger.exception(
                "Failed to download blob: %s",
                blob_name
            )

            raise RuntimeError(
                f"Failed to download blob: {blob_name}"
            ) from exc


azure_blob_service = AzureBlobService()


