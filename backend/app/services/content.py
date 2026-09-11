from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.content import ContentRecord, ContentRevision
from app.models.identity import AdminUser
from app.schemas.content import RESOURCE_ADAPTERS
from app.services.audit import append_audit

RESOURCE_DOMAINS = {"teas": "tea_content", "tea-items": "tea_content", "effects": "tea_content", "brewing-recipes": "tea_content", "suppliers": "supply", "supply-offers": "supply", "sources": "source_rights"}


def validate_resource(resource: str, payload: dict) -> dict:
    adapter = RESOURCE_ADAPTERS.get(resource)
    if not adapter:
        raise ApiError("VALIDATION_ERROR", 422, "不支持的内容资源")
    try:
        return adapter.validate_python(payload).model_dump(mode="json")
    except ValidationError as exc:
        raise ApiError("VALIDATION_ERROR", 422, "内容字段无效", [{"field": ".".join(str(x) for x in e["loc"]), "reason": e["type"]} for e in exc.errors()]) from exc


def require_etag(record: ContentRecord, if_match: str | None) -> None:
    if not if_match:
        raise ApiError("PRECONDITION_REQUIRED", 428, "缺少 If-Match")
    if if_match.strip() != f'"rv-{record.row_version}"':
        raise ApiError("VERSION_CONFLICT", 409, "内容已更新，请刷新后重试", [{"field": "row_version", "reason": "stale"}])


def content_detail(record: ContentRecord) -> dict:
    return {"id": record.id, "legacy_id": record.legacy_id, "resource": record.resource, "revision": record.revision, "row_version": record.row_version, "status": record.status, "published_revision": record.published_revision, "payload": record.payload, "created_by": record.created_by, "updated_by": record.updated_by, "reviewed_by": record.reviewed_by, "reviewed_at": record.reviewed_at, "created_at": record.created_at, "updated_at": record.updated_at}


def add_revision(db: Session, record: ContentRecord, actor_id: str, reason: str | None = None) -> None:
    existing = db.scalar(select(ContentRevision).where(ContentRevision.content_id == record.id, ContentRevision.revision == record.revision))
    if existing:
        existing.status = record.status
        existing.payload = deepcopy(record.payload)
        existing.updated_by = actor_id
        existing.reviewed_by = record.reviewed_by
        existing.change_reason = reason
    else:
        db.add(ContentRevision(id=str(uuid4()), content_id=record.id, revision=record.revision, status=record.status, payload=deepcopy(record.payload), updated_by=actor_id, reviewed_by=record.reviewed_by, change_reason=reason))


def create_content(db: Session, resource: str, payload: dict, actor_id: str) -> ContentRecord:
    clean = validate_resource(resource, payload)
    title = clean.get("name") or clean.get("title") or clean.get("offer_code") or f"{resource} 草稿"
    record = ContentRecord(id=str(uuid4()), resource=resource, title=title, payload=clean, created_by=actor_id, updated_by=actor_id, status="draft")
    db.add(record); db.flush(); add_revision(db, record, actor_id, "创建草稿")
    return record


def patch_content(db: Session, record: ContentRecord, patch: dict, actor_id: str) -> ContentRecord:
    if record.status not in {"draft", "rejected", "published"}:
        raise ApiError("INVALID_STATE", 409, "当前状态不可编辑")
    merged = deepcopy(record.payload); merged.update(patch)
    clean = validate_resource(record.resource, merged)
    if record.status == "published":
        record.revision += 1
    record.payload = clean; record.status = "draft"; record.updated_by = actor_id; record.row_version += 1
    record.reviewed_by = None; record.reviewed_at = None; record.rejection_comment = None
    add_revision(db, record, actor_id, "编辑草稿")
    return record


def check_publish_dependencies(db: Session, record: ContentRecord) -> None:
    payload = record.payload
    if record.resource != "sources":
        for source_id in payload.get("source_ids", []):
            source = db.get(ContentRecord, str(source_id))
            rights = source.published_payload.get("rights", {}) if source and source.published_payload else {}
            if not source or source.publication_state != "published" or not rights.get("public_metadata") or source.published_payload.get("revocation_kind", "none") != "none":
                raise ApiError("DEPENDENCY_UNAVAILABLE", 409, "引用来源尚未授权发布")
    if record.resource == "tea-items":
        tea = db.get(ContentRecord, str(payload.get("tea_id")))
        supplier = db.get(ContentRecord, str(payload.get("supplier_id"))) if payload.get("supplier_id") else None
        if not tea or tea.publication_state != "published":
            raise ApiError("DEPENDENCY_UNAVAILABLE", 409, "父级茶叶尚未发布")
        if supplier and (supplier.publication_state != "published" or supplier.published_payload.get("cooperation_status") != "active"):
            raise ApiError("DEPENDENCY_UNAVAILABLE", 409, "供应方不可用")


def submit_review(db: Session, record: ContentRecord, actor_id: str, revision: int) -> ContentRecord:
    if record.status not in {"draft", "rejected"} or record.revision != revision:
        raise ApiError("INVALID_STATE", 409, "只有当前草稿可提交审核")
    check_publish_dependencies(db, record)
    record.status = "pending_review"; record.row_version += 1; record.updated_by = actor_id
    add_revision(db, record, actor_id, "提交审核")
    return record


def review_content(db: Session, record: ContentRecord, reviewer: AdminUser, revision: int, decision: str, comment: str, request_id: str) -> ContentRecord:
    if record.status != "pending_review" or record.revision != revision:
        raise ApiError("INVALID_STATE", 409, "待审核版本已变化")
    if record.updated_by == reviewer.id:
        raise ApiError("SELF_REVIEW_FORBIDDEN", 403, "不能审核自己修改的版本")
    domain = RESOURCE_DOMAINS[record.resource]
    if domain not in reviewer.review_domains:
        raise ApiError("FORBIDDEN", 403, "未获该审核领域授权")
    before = record.published_revision
    if decision == "approve":
        check_publish_dependencies(db, record)
        record.status = "published"; record.publication_state = "published"; record.published_revision = record.revision; record.published_payload = deepcopy(record.payload); record.rejection_comment = None
    else:
        record.status = "rejected"; record.rejection_comment = comment
    record.reviewed_by = reviewer.id; record.reviewed_at = datetime.now(timezone.utc); record.row_version += 1
    add_revision(db, record, reviewer.id, comment)
    append_audit(db, actor_id=reviewer.id, action="review_approved" if decision == "approve" else "review_rejected", resource=record.resource, object_id=record.id, request_id=request_id, summary=f"{record.title}：{'审核通过并发布' if decision == 'approve' else '退回修改'}", before_revision=before, after_revision=record.published_revision)
    return record


def withdraw_content(db: Session, record: ContentRecord, actor_id: str, reason: str, request_id: str) -> ContentRecord:
    if record.publication_state != "published":
        raise ApiError("INVALID_STATE", 409, "只有已发布内容可下架")
    record.publication_state = "withdrawn"; record.status = "withdrawn"; record.row_version += 1
    if record.resource == "sources":
        payload = deepcopy(record.published_payload); payload["revocation_kind"] = "demo" if reason == "demo" else "external"; record.published_payload = payload
    append_audit(db, actor_id=actor_id, action="content_withdrawn", resource=record.resource, object_id=record.id, request_id=request_id, summary=f"{record.title}：已下架", before_revision=record.published_revision, after_revision=record.published_revision)
    return record


def relist_content(db: Session, record: ContentRecord, actor_id: str, request_id: str) -> ContentRecord:
    if record.publication_state != "withdrawn" or not record.published_payload:
        raise ApiError("INVALID_STATE", 409, "只有已下架的已审核内容可重新上架")
    for source_id in record.published_payload.get("source_ids", []):
        source = db.get(ContentRecord, str(source_id))
        if not source or not source.published_payload:
            raise ApiError("DEPENDENCY_UNAVAILABLE", 409, "来源不可用")
        kind = source.published_payload.get("revocation_kind", "none")
        if source.publication_state == "withdrawn" and kind == "demo":
            payload = deepcopy(source.published_payload); payload["revocation_kind"] = "none"
            source.published_payload = payload; source.payload = deepcopy(payload); source.publication_state = "published"; source.status = "published"; source.row_version += 1
        elif source.publication_state != "published" or kind != "none":
            raise ApiError("DEPENDENCY_UNAVAILABLE", 409, "独立撤回或法务禁用的来源必须由来源流程恢复")
    record.publication_state = "published"; record.status = "published"; record.row_version += 1
    append_audit(db, actor_id=actor_id, action="content_relisted", resource=record.resource, object_id=record.id, request_id=request_id, summary=f"{record.title}：免复审重新上架", before_revision=record.published_revision, after_revision=record.published_revision)
    return record
