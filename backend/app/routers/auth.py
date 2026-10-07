from fastapi import APIRouter, status

from app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import auth_service

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
async def register(user: UserRegister):
    return await auth_service.register_user(user)


@router.post(
    "/login",
    response_model=TokenResponse
)
async def login(credentials: UserLogin):
    return await auth_service.login_user(credentials)


@router.get(
    "/me",
    response_model=UserResponse
)
async def get_me(
    current_user=Depends(get_current_user)
):
    return {
        "name": current_user["name"],
        "email": current_user["email"]
    }