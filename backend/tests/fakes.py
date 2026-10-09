from copy import deepcopy
from types import SimpleNamespace


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents
        self.offset = 0
        self.maximum = len(documents)

    def sort(self, specification):
        for key, direction in reversed(specification):
            self.documents.sort(key=lambda doc: doc[key], reverse=direction < 0)
        return self

    def skip(self, offset):
        self.offset = offset
        return self

    def limit(self, limit):
        self.maximum = limit
        return self

    async def to_list(self, length):
        return deepcopy(self.documents[self.offset:self.offset + min(length, self.maximum)])


class FakeCollection:
    def __init__(self):
        self.documents = {}

    @staticmethod
    def matches(document, query):
        return all(document.get(key) == value for key, value in query.items())

    @staticmethod
    def project(document, projection):
        document = deepcopy(document)
        for key, value in (projection or {}).items():
            if value == 0:
                document.pop(key, None)
            elif isinstance(value, dict) and "$slice" in value:
                selection = value["$slice"]
                if isinstance(selection, list):
                    start, count = selection
                    document[key] = document[key][start:start + count]
                else:
                    document[key] = document[key][selection:]
        return document

    async def create_index(self, specification):
        return "owner_updated"

    async def insert_one(self, document):
        self.documents[document["_id"]] = deepcopy(document)
        return SimpleNamespace(inserted_id=document["_id"])

    async def find_one(self, query, projection=None):
        for document in self.documents.values():
            if self.matches(document, query):
                return self.project(document, projection)
        return None

    def find(self, query, projection=None):
        return FakeCursor([self.project(doc, projection) for doc in self.documents.values() if self.matches(doc, query)])

    async def update_one(self, query, update):
        for document in self.documents.values():
            if self.matches(document, query):
                for key, value in update.get("$push", {}).items():
                    document[key].append(deepcopy(value))
                for key, value in update.get("$inc", {}).items():
                    document[key] += value
                document.update(deepcopy(update.get("$set", {})))
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)


class FakeDatabase(dict):
    def __missing__(self, key):
        self[key] = FakeCollection()
        return self[key]
