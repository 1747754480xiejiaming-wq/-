from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import StrictModel


class LoginCreate(StrictModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class AdminUserPublic(StrictModel):
    id: UUID
    username: str
    display_name: str
    role: Literal["operator", "reviewer", "lead", "admin"]
    status: Literal["active", "disabled"]
    permission_codes: list[str]
    review_domains: list[str]
    must_change_password: bool
    row_version: int
    created_at: datetime
    updated_at: datetime


class PasswordChange(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class AdminUserCreate(StrictModel):
    username: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=120)
    initial_password: str = Field(min_length=12, max_length=128)
    role: Literal["operator", "reviewer", "lead", "admin"]
    permission_codes: list[str] = []
    review_domains: list[Literal["tea_content", "supply", "source_rights"]] = []


class AdminUserPatch(StrictModel):
    display_name: str | None = Field(None, min_length=1, max_length=120)
    role: Literal["operator", "reviewer", "lead", "admin"] | None = None
    permission_codes: list[str] | None = None
    review_domains: list[Literal["tea_content", "supply", "source_rights"]] | None = None
    status: Literal["active", "disabled"] | None = None


class PasswordReset(StrictModel):
    temporary_password: str = Field(min_length=12, max_length=128)
