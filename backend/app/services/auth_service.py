from fastapi import HTTPException, status

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.mongodb import mongodb
from app.schemas.user import UserLogin, UserRegister


class AuthService:

    async def register_user(self, user: UserRegister) -> dict:

        users_collection = mongodb.database["users"]

        email = user.email.lower()

        existing_user = await users_collection.find_one(
            {"email": email}
        )

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists."
            )

        user_document = {
            "name": user.name,
            "email": email,
            "password_hash": hash_password(user.password)
        }

        await users_collection.insert_one(user_document)

        return {
            "name": user.name,
            "email": email
        }


    async def login_user(self, credentials: UserLogin) -> dict:

        users_collection = mongodb.database["users"]

        email = credentials.email.lower()

        user = await users_collection.find_one(
            {"email": email}
        )

        if not user or not verify_password(
            credentials.password,
            user["password_hash"]
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )

        access_token = create_access_token(
            subject=user["email"]
        )

        return {
            "access_token": access_token,
            "token_type": "bearer"
        }


auth_service = AuthService()