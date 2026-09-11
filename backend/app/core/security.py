from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
from typing import Annotated

from argon2 import PasswordHasher
from fastapi import Cookie, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.models.identity import AdminSession, AdminUser

password_hasher = PasswordHasher()

ROLE_PERMISSIONS = {
    "operator": {"content:read", "content:write", "content:lifecycle", "imports:write"},
    "reviewer": {"content:read", "content:review"},
    "lead": {"inquiries:read", "inquiries:write", "inquiries:export"},
    "admin": {"content:read", "content:write", "content:lifecycle", "users:write", "inquiries:read", "inquiries:write", "audit:read", "imports:write"},
}


@dataclass(frozen=True)
class Principal:
    user: AdminUser
    session: AdminSession

    def has(self, permission: str) -> bool:
        return permission in ROLE_PERMISSIONS.get(self.user.role, set()) or permission in set(self.user.permission_codes)


def hash_password(value: str) -> str:
    return password_hasher.hash(value)


def verify_password(hashed: str, value: str) -> bool:
    try:
        return password_hasher.verify(hashed, value)
    except Exception:
        return False


def new_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def new_expiry(hours: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)


def require_principal(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Principal:
    settings = request.app.state.settings
    session_id = request.cookies.get(settings.session_cookie_name)
    if not session_id:
        raise ApiError("AUTH_REQUIRED", 401, "请先登录")
    admin_session = db.get(AdminSession, session_id)
    if not admin_session or not admin_session.user_id:
        raise ApiError("AUTH_REQUIRED", 401, "会话已失效，请重新登录")
    expires_at = admin_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        db.delete(admin_session)
        db.commit()
        raise ApiError("AUTH_REQUIRED", 401, "会话已过期，请重新登录")
    user = db.get(AdminUser, admin_session.user_id)
    if not user or user.status != "active":
        raise ApiError("AUTH_REQUIRED", 401, "账号不可用，请重新登录")
    return Principal(user=user, session=admin_session)


def require_csrf(
    request: Request,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    principal: Principal = Depends(require_principal),
) -> Principal:
    validate_origin(request)
    if not csrf_token or not secrets.compare_digest(csrf_token, principal.session.csrf_token):
        raise ApiError("CSRF_INVALID", 403, "请求验证失败")
    return principal


def validate_origin(request: Request) -> None:
    origin = request.headers.get("Origin")
    if not origin or origin not in request.app.state.settings.cors_origins:
        raise ApiError("ORIGIN_NOT_ALLOWED", 403, "请求来源不受信任")


def require_permission(permission: str):
    def dependency(principal: Principal = Depends(require_principal)) -> Principal:
        if not principal.has(permission):
            raise ApiError("FORBIDDEN", 403, "无权执行此操作")
        return principal
    return dependency
