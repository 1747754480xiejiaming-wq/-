from collections.abc import Callable
import hashlib
import json
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.main_support import success
from app.models.inquiry import IdempotencyRecord


def require_key(value: str | None) -> str:
    if not value:
        raise ApiError("IDEMPOTENCY_KEY_REQUIRED", 400, "缺少 Idempotency-Key")
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ApiError("VALIDATION_ERROR", 422, "Idempotency-Key 必须是 UUID", [{"field": "header.Idempotency-Key", "reason": "uuid"}]) from exc


def execute_idempotent(db: Session, request: Request, *, principal_id: str, key: str | None, body: dict, status_code: int, operation: Callable[[], dict]) -> tuple[int, dict]:
    normalized_key = require_key(key)
    request_hash = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    existing = db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.principal_id == principal_id, IdempotencyRecord.method == request.method, IdempotencyRecord.path == request.url.path, IdempotencyRecord.key == normalized_key))
    if existing:
        if existing.request_hash != request_hash:
            raise ApiError("IDEMPOTENCY_CONFLICT", 409, "同一幂等键不能用于不同请求")
        return existing.status_code, existing.response_data
    data = operation()
    envelope = success(data, request)
    db.add(IdempotencyRecord(id=str(uuid4()), principal_id=principal_id, method=request.method, path=request.url.path, key=normalized_key, request_hash=request_hash, status_code=status_code, response_data=envelope))
    db.commit()
    return status_code, envelope
