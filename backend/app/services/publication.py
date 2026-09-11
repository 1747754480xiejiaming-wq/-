from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.content import ContentRecord


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def published_payload(record: ContentRecord | None) -> dict | None:
    if not record or record.deleted_at or record.publication_state != "published" or not record.published_payload:
        return None
    return record.published_payload


def source_is_public(db: Session, source_id: str, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    source = db.get(ContentRecord, source_id)
    payload = published_payload(source)
    if not payload or source.resource != "sources":
        return False
    rights = payload.get("rights", {})
    if not rights.get("public_metadata") or payload.get("revocation_kind", "none") != "none":
        return False
    valid_from = parse_time(payload.get("valid_from"))
    valid_until = parse_time(payload.get("valid_until")) or parse_time(rights.get("authorized_until"))
    if valid_from and current < valid_from:
        return False
    return not valid_until or current < valid_until


def sources_are_public(db: Session, payload: dict) -> bool:
    return all(source_is_public(db, str(source_id)) for source_id in payload.get("source_ids", []))


def content_is_public(db: Session, record: ContentRecord | None) -> bool:
    payload = published_payload(record)
    if not payload:
        return False
    if record.resource == "sources":
        return source_is_public(db, record.id)
    if not sources_are_public(db, payload):
        return False
    if record.resource == "tea-items":
        tea = db.get(ContentRecord, str(payload.get("tea_id")))
        supplier = db.get(ContentRecord, str(payload.get("supplier_id"))) if payload.get("supplier_id") else None
        if not content_is_public(db, tea):
            return False
        if supplier:
            supplier_payload = published_payload(supplier)
            if not content_is_public(db, supplier) or supplier_payload.get("cooperation_status") != "active":
                return False
    if record.resource in {"effects", "brewing-recipes"}:
        tea = db.get(ContentRecord, str(payload.get("tea_id")))
        item = db.get(ContentRecord, str(payload.get("tea_item_id"))) if payload.get("tea_item_id") else None
        if not content_is_public(db, tea) or (item and not content_is_public(db, item)):
            return False
    if record.resource == "supply-offers":
        item = db.get(ContentRecord, str(payload.get("tea_item_id")))
        supplier = db.get(ContentRecord, str(payload.get("supplier_id")))
        if not content_is_public(db, item) or not content_is_public(db, supplier):
            return False
        valid_from = parse_time(payload.get("valid_from"))
        valid_until = parse_time(payload.get("valid_until"))
        now = datetime.now(timezone.utc)
        if valid_from and now < valid_from or not valid_until or now >= valid_until:
            return False
    return True


def visible_record(db: Session, content_id: str, resource: str | None = None) -> ContentRecord:
    record = db.get(ContentRecord, content_id)
    if not record or (resource and record.resource != resource) or not content_is_public(db, record):
        raise ApiError("NOT_FOUND", 404, "资源不存在")
    return record


def visible_records(db: Session, resource: str) -> list[ContentRecord]:
    records = db.scalars(select(ContentRecord).where(ContentRecord.resource == resource).order_by(ContentRecord.updated_at.desc(), ContentRecord.id.asc())).all()
    return [record for record in records if content_is_public(db, record)]
