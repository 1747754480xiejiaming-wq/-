from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import Principal, require_csrf, require_principal
from app.main_support import success
from app.models.identity import AdminUser, AuditEntry
from app.models.inquiry import Inquiry
from app.schemas.public import InquiryPatch
from app.services.audit import append_audit
from app.services.catalog import paginate
from app.services.content import require_etag

router = APIRouter(tags=["admin-inquiries"])


def require_inquiries(principal: Principal, write: bool = False) -> None:
    permission = "inquiries:write" if write else "inquiries:read"
    if not principal.has(permission):
        raise ApiError("FORBIDDEN", 403, "无权访问咨询线索")


def mask_contact(value: str, channel: str) -> str:
    if channel == "email":
        local, domain = value.split("@", 1)
        return f"{local[:1]}***@{domain}"
    return f"{value[:3]}****{value[-4:]}" if len(value) >= 7 else "***"


def inquiry_data(record: Inquiry, include_contact: bool = False) -> dict:
    data = {"id": record.id, "kind": record.kind, "tea_id": record.tea_id, "tea_item_id": record.tea_item_id, "status": record.status, "contact_masked": mask_contact(record.contact_value, record.contact_channel), "assignee_id": record.assignee_id, "created_at": record.created_at, "updated_at": record.updated_at, "row_version": record.row_version, "need": record.need, "consent": {"notice_version": record.notice_version, "purpose": record.consent_purpose, "accepted_at": record.accepted_at}, "notes": record.notes}
    if include_contact: data["contact"] = {"channel": record.contact_channel, "value": record.contact_value}
    return data


@router.get("/admin/inquiries", operation_id="listInquiries")
def list_inquiries(request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), status: str | None = None, kind: str | None = None, tea_id: str | None = None, tea_item_id: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    require_inquiries(principal)
    records = db.scalars(select(Inquiry).order_by(Inquiry.updated_at.desc(), Inquiry.id.asc())).all()
    records = [r for r in records if (not status or r.status == status) and (not kind or r.kind == kind) and (not tea_id or r.tea_id == tea_id) and (not tea_item_id or r.tea_item_id == tea_item_id)]
    summaries = [{k: v for k, v in inquiry_data(r).items() if k not in {"need", "consent", "notes"}} for r in records]
    return success(paginate(summaries, page, page_size), request)


@router.get("/admin/inquiries/{inquiry_id}", operation_id="getInquiry")
def get_inquiry(inquiry_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal)):
    require_inquiries(principal); record = db.get(Inquiry, inquiry_id)
    if not record: raise ApiError("NOT_FOUND", 404, "线索不存在")
    include_contact = principal.has("inquiries:read_contact")
    if include_contact:
        append_audit(db, actor_id=principal.user.id, action="inquiry_contact_viewed", resource="inquiries", object_id=record.id, request_id=request.state.request_id, summary=f"线索 {record.id}：查看联系方式"); db.commit()
    return JSONResponse(content=success(inquiry_data(record, include_contact), request), headers={"ETag": f'"rv-{record.row_version}"'})


@router.patch("/admin/inquiries/{inquiry_id}", operation_id="patchInquiry")
def patch_inquiry(inquiry_id: str, body: InquiryPatch, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), if_match: Annotated[str | None, Header(alias="If-Match")] = None):
    require_inquiries(principal, True); record = db.get(Inquiry, inquiry_id)
    if not record: raise ApiError("NOT_FOUND", 404, "线索不存在")
    require_etag(record, if_match)
    transitions = {"new": {"assigned", "contacted", "closed"}, "assigned": {"contacted", "closed"}, "contacted": {"closed"}, "closed": set()}
    if body.status and body.status != record.status and body.status not in transitions[record.status]: raise ApiError("INVALID_STATE", 409, "线索状态不能回退")
    if body.status == "closed" and not body.note: raise ApiError("VALIDATION_ERROR", 422, "关闭线索必须填写备注")
    if body.assignee_id:
        assignee = db.get(AdminUser, str(body.assignee_id))
        if not assignee or assignee.status != "active" or assignee.role not in {"lead", "admin"}: raise ApiError("VALIDATION_ERROR", 422, "指派对象没有线索权限")
        record.assignee_id = assignee.id
        if record.status == "new" and not body.status: record.status = "assigned"
    if body.status: record.status = body.status
    if body.note: record.notes = [*record.notes, {"text": body.note, "actor_id": principal.user.id}]
    record.row_version += 1
    append_audit(db, actor_id=principal.user.id, action="inquiry_updated", resource="inquiries", object_id=record.id, request_id=request.state.request_id, summary=f"线索 {record.id}：状态更新为 {record.status}"); db.commit()
    return JSONResponse(content=success(inquiry_data(record, principal.has("inquiries:read_contact")), request), headers={"ETag": f'"rv-{record.row_version}"'})


@router.get("/admin/audit-logs", operation_id="listAuditLogs")
def audit_logs(request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), actor_id: str | None = None, action: str | None = None, resource: str | None = None, object_id: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    if not principal.has("audit:read"): raise ApiError("FORBIDDEN", 403, "无权查看审计记录")
    rows = db.scalars(select(AuditEntry).order_by(AuditEntry.created_at.desc(), AuditEntry.id.asc())).all()
    rows = [r for r in rows if (not actor_id or r.actor_id == actor_id) and (not action or r.action == action) and (not resource or r.resource == resource) and (not object_id or r.object_id == object_id)]
    data = [{"id": r.id, "actor_id": r.actor_id, "action": r.action, "resource": r.resource, "object_id": r.object_id, "before_revision": r.before_revision, "after_revision": r.after_revision, "summary_redacted": r.summary_redacted, "request_id": r.request_id, "created_at": r.created_at} for r in rows]
    return success(paginate(data, page, page_size), request)
