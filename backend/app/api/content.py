from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import Principal, require_csrf, require_principal
from app.main_support import success
from app.models.content import ContentRecord, ContentRevision
from app.schemas.content import LifecycleCreate, ReviewCreate, RevisionCreate, SubmitReview
from app.services.audit import append_audit
from app.services.catalog import paginate
from app.services.content import add_revision, content_detail, create_content, patch_content, relist_content, require_etag, review_content, submit_review, validate_resource, withdraw_content
from app.services.idempotency import execute_idempotent
from app.services.idempotency import require_key
from app.models.base import utcnow

router = APIRouter(tags=["admin-content"])


def need(principal: Principal, permission: str) -> None:
    if not principal.has(permission):
        raise ApiError("FORBIDDEN", 403, "无权执行此操作")


def get_record(db: Session, resource: str, content_id: str) -> ContentRecord:
    record = db.get(ContentRecord, content_id)
    if not record or record.resource != resource or record.deleted_at:
        raise ApiError("NOT_FOUND", 404, "内容不存在")
    return record


@router.get("/admin/content/{resource}", operation_id="listAdminContent")
def list_content(resource: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), q: str | None = None, status: str | None = None, tea_id: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    need(principal, "content:read")
    records = db.scalars(select(ContentRecord).where(ContentRecord.resource == resource, ContentRecord.deleted_at.is_(None)).order_by(ContentRecord.updated_at.desc(), ContentRecord.id.asc())).all()
    records = [r for r in records if (not q or q.lower() in r.title.lower()) and (not status or r.status == status) and (not tea_id or str(r.payload.get("tea_id")) == tea_id)]
    summaries = [{**{k: v for k, v in content_detail(r).items() if k != "payload"}, "title": r.title} for r in records]
    return success(paginate(summaries, page, page_size), request)


@router.post("/admin/content/{resource}", status_code=201, operation_id="createAdminContent")
def create(resource: str, request: Request, body: Annotated[dict, Body()], db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    need(principal, "content:write")
    def operation():
        record = create_content(db, resource, body, principal.user.id)
        append_audit(db, actor_id=principal.user.id, action="draft_created", resource=resource, object_id=record.id, request_id=request.state.request_id, summary=f"{record.title}：创建草稿")
        db.flush(); return content_detail(record)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body, status_code=201, operation=operation)
    return JSONResponse(status_code=code, content=envelope, headers={"ETag": f'"rv-{envelope["data"]["row_version"]}"'})


@router.get("/admin/content/{resource}/{content_id}", operation_id="getAdminContent")
def detail(resource: str, content_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), revision: int | None = Query(None, ge=1)):
    need(principal, "content:read"); record = get_record(db, resource, content_id)
    if revision and revision != record.revision:
        historical = db.scalar(select(ContentRevision).where(ContentRevision.content_id == record.id, ContentRevision.revision == revision))
        if not historical: raise ApiError("NOT_FOUND", 404, "版本不存在")
        data = content_detail(record) | {"revision": revision, "status": historical.status, "payload": historical.payload}
    else: data = content_detail(record)
    return JSONResponse(content=success(data, request), headers={"ETag": f'"rv-{record.row_version}"'})


@router.patch("/admin/content/{resource}/{content_id}", operation_id="patchAdminContent")
def patch(resource: str, content_id: str, request: Request, body: Annotated[dict, Body()], db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None):
    need(principal, "content:write"); record = get_record(db, resource, content_id); require_etag(record, if_match)
    patch_content(db, record, body, principal.user.id); db.commit()
    return JSONResponse(content=success(content_detail(record), request), headers={"ETag": f'"rv-{record.row_version}"'})


@router.get("/admin/content/{resource}/{content_id}/versions", operation_id="listContentVersions")
def versions(resource: str, content_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    need(principal, "content:read"); record = get_record(db, resource, content_id)
    rows = db.scalars(select(ContentRevision).where(ContentRevision.content_id == record.id).order_by(ContentRevision.revision.desc())).all()
    return success(paginate([{"revision": r.revision, "status": r.status, "created_at": r.created_at, "updated_at": r.created_at, "updated_by": r.updated_by, "reviewed_by": r.reviewed_by, "change_reason": r.change_reason} for r in rows], page, page_size), request)


@router.get("/admin/content/{resource}/{content_id}/diff", operation_id="diffContentVersions")
def diff(resource: str, content_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), from_revision: int = Query(ge=1), to_revision: int = Query(ge=1)):
    need(principal, "content:read"); record = get_record(db, resource, content_id)
    revisions = {r.revision: r for r in db.scalars(select(ContentRevision).where(ContentRevision.content_id == record.id, ContentRevision.revision.in_([from_revision, to_revision]))).all()}
    if len(revisions) != 2: raise ApiError("NOT_FOUND", 404, "版本不存在")
    before, after = revisions[from_revision].payload, revisions[to_revision].payload
    changes = [{"field": key, "before": before.get(key), "after": after.get(key)} for key in sorted(set(before) | set(after)) if before.get(key) != after.get(key)]
    return success({"changes": changes}, request)


@router.post("/admin/content/{resource}/{content_id}/revisions", status_code=201, operation_id="createContentRevision")
def create_revision(resource: str, content_id: str, body: RevisionCreate, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    need(principal, "content:write"); record = get_record(db, resource, content_id); require_etag(record, if_match)
    if record.status != "published" or body.base_revision != record.published_revision: raise ApiError("INVALID_STATE", 409, "只能从当前发布版本创建草稿")
    def operation():
        record.revision += 1; record.payload = dict(record.published_payload); record.status = "draft"; record.updated_by = principal.user.id; record.row_version += 1; add_revision(db, record, principal.user.id, body.reason); db.flush(); return content_detail(record)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=201, operation=operation)
    return JSONResponse(status_code=code, content=envelope)


@router.post("/admin/content/{resource}/{content_id}/submit-review", operation_id="submitContentReview")
def submit(resource: str, content_id: str, body: SubmitReview, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    need(principal, "content:write"); record = get_record(db, resource, content_id); require_etag(record, if_match)
    def operation(): submit_review(db, record, principal.user.id, body.revision); db.flush(); return content_detail(record)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=200, operation=operation); return JSONResponse(status_code=code, content=envelope)


@router.get("/admin/reviews", operation_id="listReviews")
def reviews(request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), resource: str | None = None, status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    need(principal, "content:review")
    records = db.scalars(select(ContentRecord).where(ContentRecord.status.in_(["pending_review", "published", "rejected"]))).all()
    records = [r for r in records if (not resource or r.resource == resource) and (not status or (status == "pending" and r.status == "pending_review") or (status == "resolved" and r.status in {"published", "rejected"}))]
    data = [{"resource": r.resource, "content_id": r.id, "revision": r.revision, "title": r.title, "submitted_by": r.updated_by, "submitted_at": r.updated_at, "review_domain": {"sources": "source_rights", "suppliers": "supply", "supply-offers": "supply"}.get(r.resource, "tea_content"), "status": "pending" if r.status == "pending_review" else "resolved"} for r in records]
    return success(paginate(data, page, page_size), request)


@router.post("/admin/content/{resource}/{content_id}/review", operation_id="reviewContent")
def review(resource: str, content_id: str, body: ReviewCreate, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    need(principal, "content:review"); record = get_record(db, resource, content_id); require_etag(record, if_match)
    def operation(): review_content(db, record, principal.user, body.revision, body.decision, body.comment, request.state.request_id); db.flush(); return content_detail(record)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=200, operation=operation); return JSONResponse(status_code=code, content=envelope)


def lifecycle_command(action: str, resource: str, content_id: str, body: LifecycleCreate, request: Request, db: Session, principal: Principal, if_match: str | None, idempotency_key: str | None):
    need(principal, "content:lifecycle"); record = get_record(db, resource, content_id); require_etag(record, if_match)
    def operation():
        if action == "withdraw": withdraw_content(db, record, principal.user.id, body.reason or "", request.state.request_id)
        else: relist_content(db, record, principal.user.id, request.state.request_id)
        db.flush(); return content_detail(record)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=200, operation=operation); return JSONResponse(status_code=code, content=envelope)


@router.post("/admin/content/{resource}/{content_id}/withdraw", operation_id="withdrawContent")
def withdraw(resource: str, content_id: str, body: LifecycleCreate, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None): return lifecycle_command("withdraw", resource, content_id, body, request, db, principal, if_match, idempotency_key)


@router.post("/admin/content/{resource}/{content_id}/relist", operation_id="relistContent")
def relist(resource: str, content_id: str, body: LifecycleCreate, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None): return lifecycle_command("relist", resource, content_id, body, request, db, principal, if_match, idempotency_key)


@router.delete("/admin/content/tea-items/{content_id}", status_code=204, operation_id="deleteTeaItem")
def delete_item(content_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    require_key(idempotency_key); record = get_record(db, "tea-items", content_id); require_etag(record, if_match)
    if principal.user.role != "admin" and not (principal.user.role == "operator" and record.status == "draft" and record.created_by == principal.user.id): raise ApiError("FORBIDDEN", 403, "仅管理员可删除商品，运营只能删除本人未提交草稿")
    record.deleted_at = utcnow(); record.status = "deleted"; record.publication_state = "deleted"; record.row_version += 1
    append_audit(db, actor_id=principal.user.id, action="content_deleted", resource="tea-items", object_id=record.id, request_id=request.state.request_id, summary=f"{record.title}：逻辑删除"); db.commit()
    return Response(status_code=204)
