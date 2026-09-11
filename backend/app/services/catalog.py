from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.content import ContentRecord
from app.services.publication import published_payload, visible_record, visible_records


def version_data(record: ContentRecord) -> dict:
    return {
        "revision": record.published_revision,
        "published_at": record.reviewed_at or record.updated_at,
        "updated_at": record.updated_at,
        "reviewer_label": "客户审核人",
    }


def tea_public(record: ContentRecord) -> dict:
    payload = published_payload(record)
    return {"id": record.id, "legacy_id": record.legacy_id, "name": payload["name"], "category": payload["category"], "aliases": payload.get("aliases", []), "origin": payload.get("origin", ""), "process": payload.get("process", ""), "version": version_data(record)}


def item_public(record: ContentRecord) -> dict:
    payload = published_payload(record)
    return {
        "id": record.id, "legacy_id": record.legacy_id, "tea_id": payload["tea_id"], "sku": payload["sku"],
        "batch_code": payload["batch_code"], "name": payload["name"], "grade": payload.get("grade", ""),
        "year": payload["year"], "specification": payload.get("specification", ""), "storage": payload.get("storage", ""),
        "shelf_life_months": payload.get("shelf_life_months"), "images": [], "subtitle": payload.get("subtitle", ""),
        "taste": payload.get("taste", []), "price": payload.get("price", ""), "description": payload.get("description", ""),
        "version": version_data(record),
    }


def source_summary(db: Session, source_id: str) -> dict:
    source = visible_record(db, source_id, "sources")
    payload = published_payload(source)
    return {"id": source.id, "type": payload["type"], "title": payload["title"], "author_or_org": payload.get("author_or_org") or None, "source_date": payload.get("source_date"), "revision": source.published_revision}


def match_record(db: Session, tea_id: str, tea_item_id: str | None, resource: str) -> dict:
    visible_record(db, tea_id, "teas")
    if tea_item_id:
        item = visible_record(db, tea_item_id, "tea-items")
        if str(published_payload(item).get("tea_id")) != tea_id:
            raise ApiError("VALIDATION_ERROR", 422, "茶品与茶叶不匹配", [{"field": "tea_item_id", "reason": "not_associated"}])
    candidates = visible_records(db, resource)
    exact = next((r for r in candidates if tea_item_id and str(published_payload(r).get("tea_item_id")) == tea_item_id), None)
    generic = next((r for r in candidates if str(published_payload(r).get("tea_id")) == tea_id and not published_payload(r).get("tea_item_id")), None)
    record = exact or generic
    return {"requested": {"tea_id": tea_id, "tea_item_id": tea_item_id}, "match_level": "tea_item" if exact else "tea" if generic else "none", "fallback_reason": "no_item_record" if tea_item_id and not exact and generic else None, "record": record, "notice": "当前使用茶类通用资料" if tea_item_id and not exact and generic else None}


def effect_public(db: Session, record: ContentRecord) -> dict:
    payload = published_payload(record)
    return {"id": record.id, "tea_id": payload["tea_id"], "tea_item_id": payload.get("tea_item_id"), "features": payload.get("features", []), "scenarios": payload.get("scenarios", []), "cautions": payload.get("cautions", []), "claims": payload.get("claims", []), "sources": [source_summary(db, str(x)) for x in payload.get("source_ids", [])], "boundary_notice": "了解茶，不替代专业健康建议", "version": version_data(record)}


def brewing_public(db: Session, record: ContentRecord) -> dict:
    payload = published_payload(record)
    return {"id": record.id, "tea_id": payload["tea_id"], "tea_item_id": payload.get("tea_item_id"), "title": payload["title"], "vessel": payload.get("vessel", ""), "water_ml": payload.get("water_ml"), "tea_g": payload.get("tea_g"), "temperature_c": payload.get("temperature_c"), "water_quality": payload.get("water_quality", ""), "rinse": payload.get("rinse", False), "steps": payload.get("steps", []), "adjustments": payload.get("adjustments", []), "sources": [source_summary(db, str(x)) for x in payload.get("source_ids", [])], "version": version_data(record)}


def supply_public(db: Session, record: ContentRecord) -> dict:
    payload = published_payload(record)
    item = visible_record(db, str(payload["tea_item_id"]), "tea-items")
    item_payload = published_payload(item)
    disclosure = set(payload.get("disclosure", {}).get("public_fields", []))
    return {"id": record.id, "tea_id": item_payload["tea_id"], "tea_item_id": item.id, "sku": item_payload["sku"], "batch_code": item_payload["batch_code"], "specification": item_payload.get("specification", ""), "price_mode": payload["price_mode"] if "price" in disclosure else "quote_only", "price": payload.get("price") if "price" in disclosure else None, "inventory_mode": payload.get("inventory_mode", "unknown"), "quantity": payload.get("quantity") if "quantity" in disclosure else None, "minimum_order": payload.get("minimum_order") if "minimum_order" in disclosure else None, "lead_time_text": payload.get("lead_time_text") if "lead_time_text" in disclosure else None, "ship_from": payload.get("ship_from") if "ship_from" in disclosure else None, "sample_rule": payload.get("sample_rule") if "sample_rule" in disclosure else None, "as_of": payload["as_of"], "valid_until": payload["valid_until"], "sources": [source_summary(db, str(x)) for x in payload.get("source_ids", [])], "notice": "演示参考信息，不构成库存或价格承诺", "version": version_data(record)}


def paginate(items: list[dict], page: int, page_size: int) -> dict:
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "page": page, "page_size": page_size, "total": len(items)}
