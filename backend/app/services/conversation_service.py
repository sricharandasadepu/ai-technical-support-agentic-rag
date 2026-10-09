"""Owner-scoped, bounded MongoDB conversations with atomic turn persistence."""

from datetime import datetime, timezone
from uuid import uuid4

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

MAX_CONVERSATION_TURNS = 100


class ConversationNotFound(RuntimeError):
    pass


class ConversationConflict(RuntimeError):
    pass


class ConversationStorageUnavailable(RuntimeError):
    pass


class ConversationService:
    def __init__(self, database):
        self.collection = database["conversations"]

    async def ensure_indexes(self):
        try:
            await self.collection.create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        except PyMongoError:
            raise ConversationStorageUnavailable("Conversation storage is unavailable") from None

    async def create(self, owner_id: str, message: str) -> dict:
        now = datetime.now(timezone.utc)
        document = {"_id": str(uuid4()), "owner_id": owner_id, "title": message[:80],
                    "created_at": now, "updated_at": now, "turn_count": 0, "turns": []}
        try:
            await self.collection.insert_one(document)
        except PyMongoError:
            raise ConversationStorageUnavailable("Conversation storage is unavailable") from None
        return document

    async def get(self, owner_id: str, conversation_id: str, *, offset=0, limit=20,
                  recent=False) -> dict:
        projection = {"turns": {"$slice": -limit if recent else [offset, limit]}}
        try:
            document = await self.collection.find_one(
                {"_id": conversation_id, "owner_id": owner_id}, projection)
        except PyMongoError:
            raise ConversationStorageUnavailable("Conversation storage is unavailable") from None
        if document is None:
            # Same response for nonexistent and another owner's conversations.
            raise ConversationNotFound("Conversation not found")
        return document

    async def list(self, owner_id: str, *, offset=0, limit=20) -> list[dict]:
        try:
            cursor = self.collection.find({"owner_id": owner_id}, {"turns": 0, "owner_id": 0})
            return await cursor.sort([("updated_at", DESCENDING), ("_id", ASCENDING)]).skip(offset).limit(limit).to_list(length=limit)
        except PyMongoError:
            raise ConversationStorageUnavailable("Conversation storage is unavailable") from None

    async def append_turn(self, owner_id: str, conversation: dict, message: str, result: dict):
        now = datetime.now(timezone.utc)
        count = conversation["turn_count"]
        if count >= MAX_CONVERSATION_TURNS:
            raise ConversationConflict("Conversation is full; start a new conversation")
        turn = {"user_message": message, "answer": result["answer"], "sources": result["sources"],
                "status": result["status"], "escalation_recommended": result["escalation_recommended"],
                "escalation_reason": result.get("escalation_reason"), "created_at": now}
        try:
            updated = await self.collection.update_one(
                {"_id": conversation["_id"], "owner_id": owner_id, "turn_count": count},
                {"$push": {"turns": turn}, "$inc": {"turn_count": 1}, "$set": {"updated_at": now}})
        except PyMongoError:
            raise ConversationStorageUnavailable("Conversation storage is unavailable") from None
        if updated.matched_count != 1:
            raise ConversationConflict("Conversation changed during processing; retry your message")


def recent_history(conversation: dict, max_turns: int) -> list[dict[str, str]]:
    if max_turns == 0:
        return []
    messages = []
    for turn in conversation.get("turns", [])[-max_turns:]:
        # Bounded context for reference resolution, never a source of technical evidence.
        messages.extend([{"role": "user", "content": turn["user_message"][:4000]},
                         {"role": "assistant", "content": turn["answer"][:2000]}])
    return messages
