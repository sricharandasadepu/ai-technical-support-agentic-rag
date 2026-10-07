from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.core.config import settings


class MongoDB:
    def __init__(self):
        self.client: AsyncMongoClient | None = None
        self.database = None

    async def connect(self):
        try:
            self.client = AsyncMongoClient(settings.mongodb_uri)

            # Verify that MongoDB is actually reachable.
            await self.client.admin.command("ping")

            self.database = self.client["technical_support_db"]

            print("MongoDB connected successfully.")

        except PyMongoError as exc:
            self.client = None
            self.database = None
            raise RuntimeError("Failed to connect to MongoDB.") from exc

    async def close(self):
        if self.client is not None:
            await self.client.close()
            print("MongoDB connection closed.")


mongodb = MongoDB()