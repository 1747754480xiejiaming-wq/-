from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from fastapi import Request


def meta_for(request: Request) -> dict[str, str]:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return {"request_id": request_id, "server_time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}


def jsonable(value):
    if isinstance(value, (datetime, date)):
        normalized = value if not isinstance(value, datetime) or value.tzinfo else value.replace(tzinfo=timezone.utc)
        return normalized.isoformat().replace("+00:00", "Z")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return value


def success(data: object, request: Request) -> dict[str, object]:
    return {"data": jsonable(data), "meta": meta_for(request)}


def failure(request: Request, code: str, message: str, details: list[dict] | None = None) -> dict[str, object]:
    return {"error": {"code": code, "message": message, "details": details or []}, "meta": meta_for(request)}
