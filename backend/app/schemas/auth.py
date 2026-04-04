from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    username: str
    role: str
    user_id: int


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "employee"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    active: bool

    model_config = {"from_attributes": True}
