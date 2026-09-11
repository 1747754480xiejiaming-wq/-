from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import Principal, hash_password, new_expiry, new_token, require_csrf, require_principal, validate_origin, verify_password
from app.main_support import success
from app.models.identity import AdminSession, AdminUser
from app.schemas.auth import AdminUserCreate, AdminUserPatch, LoginCreate, PasswordChange, PasswordReset
from app.services.audit import append_audit
from app.services.catalog import paginate
from app.services.content import require_etag
from app.services.idempotency import execute_idempotent

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


def user_data(user: AdminUser) -> dict:
    return {
        "id": user.id, "username": user.username, "display_name": user.display_name,
        "role": user.role, "status": user.status, "permission_codes": user.permission_codes,
        "review_domains": user.review_domains, "must_change_password": user.must_change_password,
        "row_version": user.row_version, "created_at": user.created_at, "updated_at": user.updated_at,
    }


@router.get("/csrf", operation_id="getAdminCsrf")
def csrf(request: Request, response: Response, db: Annotated[Session, Depends(get_db)]):
    settings = request.app.state.settings
    current_id = request.cookies.get(settings.session_cookie_name)
    current = db.get(AdminSession, current_id) if current_id else None
    if current:
        expires_at = current.expires_at if current.expires_at.tzinfo else current.expires_at.replace(tzinfo=timezone.utc)
        if expires_at > datetime.now(timezone.utc):
            return success({"csrf_token": current.csrf_token}, request)
    session = AdminSession(id=new_token(), csrf_token=new_token(), expires_at=new_expiry(settings.session_hours))
    db.add(session)
    db.commit()
    response.set_cookie(settings.session_cookie_name, session.id, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=settings.session_hours * 3600)
    return success({"csrf_token": session.csrf_token}, request)


@router.post("/login", operation_id="loginAdmin")
def login(
    body: LoginCreate,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
):
    settings = request.app.state.settings
    validate_origin(request)
    old_id = request.cookies.get(settings.session_cookie_name)
    old = db.get(AdminSession, old_id) if old_id else None
    if not old or not csrf_token or old.csrf_token != csrf_token:
        raise ApiError("CSRF_INVALID", 403, "请求验证失败")
    user = db.scalar(select(AdminUser).where(AdminUser.username == body.username))
    if not user or user.status != "active" or not verify_password(user.password_hash, body.password):
        raise ApiError("INVALID_CREDENTIALS", 401, "用户名或密码错误")
    db.delete(old)
    session = AdminSession(id=new_token(), user_id=user.id, csrf_token=new_token(), expires_at=new_expiry(settings.session_hours))
    db.add(session)
    db.commit()
    response.set_cookie(settings.session_cookie_name, session.id, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=settings.session_hours * 3600)
    return success({"user": user_data(user), "csrf_token": session.csrf_token}, request)


@router.get("/me", operation_id="getCurrentAdmin")
def me(request: Request, principal: Principal = Depends(require_principal)):
    return success(user_data(principal.user), request)


@router.post("/logout", status_code=204, operation_id="logoutAdmin")
def logout(request: Request, response: Response, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf)):
    db.delete(principal.session)
    db.commit()
    response.delete_cookie(request.app.state.settings.session_cookie_name)
    return Response(status_code=204)


@router.patch("/password", operation_id="changeAdminPassword")
def change_password(body: PasswordChange, request: Request, response: Response, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf)):
    if not verify_password(principal.user.password_hash, body.current_password):
        raise ApiError("INVALID_CREDENTIALS", 401, "当前密码错误")
    principal.user.password_hash = hash_password(body.new_password); principal.user.must_change_password = False; principal.user.row_version += 1
    db.execute(delete(AdminSession).where(AdminSession.user_id == principal.user.id)); db.commit(); response.delete_cookie(request.app.state.settings.session_cookie_name)
    return success({"changed": True}, request)


users_router = APIRouter(prefix="/admin/users", tags=["admin-users"])


def require_user_admin(principal: Principal) -> None:
    if not principal.has("users:write"):
        raise ApiError("FORBIDDEN", 403, "无权管理账号")


@users_router.get("", operation_id="listAdminUsers")
def list_users(request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), status: str | None = None, page: int = 1, page_size: int = 20):
    require_user_admin(principal)
    users = db.scalars(select(AdminUser).order_by(AdminUser.updated_at.desc(), AdminUser.id.asc())).all()
    return success(paginate([user_data(u) for u in users if not status or u.status == status], page, page_size), request)


@users_router.post("", operation_id="createAdminUser", status_code=201)
def create_user(body: AdminUserCreate, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    require_user_admin(principal)
    def operation():
        if db.scalar(select(AdminUser).where(AdminUser.username == body.username)):
            raise ApiError("ALREADY_EXISTS", 409, "用户名已存在")
        user = AdminUser(id=str(uuid4()), username=body.username, display_name=body.display_name, password_hash=hash_password(body.initial_password), role=body.role, permission_codes=body.permission_codes, review_domains=list(body.review_domains), must_change_password=True)
        db.add(user); db.flush(); append_audit(db, actor_id=principal.user.id, action="user_created", resource="users", object_id=user.id, request_id=request.state.request_id, summary=f"创建账号：{user.username}"); return user_data(user)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=201, operation=operation)
    return JSONResponse(status_code=code, content=envelope)


@users_router.patch("/{user_id}", operation_id="patchAdminUser")
def patch_user(user_id: str, body: AdminUserPatch, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None):
    require_user_admin(principal); user = db.get(AdminUser, user_id)
    if not user: raise ApiError("NOT_FOUND", 404, "账号不存在")
    require_etag(user, if_match)
    next_role = body.role or user.role; next_status = body.status or user.status
    if user.role == "admin" and user.status == "active" and (next_role != "admin" or next_status != "active"):
        active_admins = db.scalar(select(func.count()).select_from(AdminUser).where(AdminUser.role == "admin", AdminUser.status == "active"))
        if active_admins <= 1: raise ApiError("LAST_ADMIN_REQUIRED", 409, "必须保留至少一个有效管理员")
    if body.display_name is not None: user.display_name = body.display_name
    if body.role is not None: user.role = body.role
    if body.permission_codes is not None: user.permission_codes = body.permission_codes
    if body.review_domains is not None: user.review_domains = list(body.review_domains)
    if body.status is not None: user.status = body.status
    user.row_version += 1
    if body.status == "disabled": db.execute(delete(AdminSession).where(AdminSession.user_id == user.id))
    append_audit(db, actor_id=principal.user.id, action="user_updated", resource="users", object_id=user.id, request_id=request.state.request_id, summary=f"更新账号权限：{user.username}"); db.commit()
    return JSONResponse(content=success(user_data(user), request), headers={"ETag": f'"rv-{user.row_version}"'})


@users_router.post("/{user_id}/password-reset", operation_id="resetAdminPassword")
def reset_password(user_id: str, body: PasswordReset, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    require_user_admin(principal); user = db.get(AdminUser, user_id)
    if not user: raise ApiError("NOT_FOUND", 404, "账号不存在")
    def operation():
        user.password_hash = hash_password(body.temporary_password); user.must_change_password = True; user.row_version += 1
        db.execute(delete(AdminSession).where(AdminSession.user_id == user.id)); append_audit(db, actor_id=principal.user.id, action="password_reset", resource="users", object_id=user.id, request_id=request.state.request_id, summary=f"重置账号密码：{user.username}"); return {"reset": True}
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body={"user_id": user_id, "request": "password_reset"}, status_code=200, operation=operation)
    return JSONResponse(status_code=code, content=envelope)
