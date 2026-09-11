from datetime import datetime, timezone
import re
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import validate_origin
from app.main_support import success
from app.models.content import ContentRecord
from app.models.inquiry import Feedback, Inquiry, MetricEvent
from app.schemas.public import EventBatchCreate, FeedbackCreate, InquiryCreate, QuestionCreate
from app.services.catalog import brewing_public, effect_public, item_public, match_record, paginate, source_summary, supply_public, tea_public
from app.services.idempotency import execute_idempotent
from app.services.publication import published_payload, visible_record, visible_records

router = APIRouter(tags=["public"])


def principal_id(public_session: str | None) -> str:
    if not public_session:
        raise ApiError("PUBLIC_SESSION_REQUIRED", 401, "请先读取公开配置建立会话")
    return public_session


@router.get("/teas", operation_id="listTeas")
def list_teas(request: Request, db: Annotated[Session, Depends(get_db)], q: str | None = Query(None, max_length=100), category: str | None = None, entity_type: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    if entity_type not in {None, "tea", "tea_item"}:
        raise ApiError("VALIDATION_ERROR", 422, "实体类型无效")
    hits: list[dict] = []
    if entity_type in {None, "tea"}:
        for record in visible_records(db, "teas"):
            payload = published_payload(record)
            haystack = " ".join([payload["name"], payload.get("category", ""), *payload.get("aliases", [])]).lower()
            if (not q or q.lower() in haystack) and (not category or payload.get("category") == category):
                hits.append({"entity_type": "tea", "id": record.id, "tea_id": record.id, "tea_item_id": None, "name": payload["name"], "category": payload["category"], "sku": None, "batch_code": None, "legacy_id": record.legacy_id})
    if entity_type in {None, "tea_item"}:
        for record in visible_records(db, "tea-items"):
            payload = published_payload(record)
            tea = visible_record(db, str(payload["tea_id"]), "teas")
            tea_payload = published_payload(tea)
            haystack = " ".join([payload["name"], payload["sku"], payload["batch_code"]]).lower()
            if (not q or q.lower() in haystack) and (not category or tea_payload["category"] == category):
                hits.append({"entity_type": "tea_item", "id": record.id, "tea_id": tea.id, "tea_item_id": record.id, "name": payload["name"], "category": tea_payload["category"], "sku": payload["sku"], "batch_code": payload["batch_code"], "legacy_id": record.legacy_id})
    return success(paginate(hits, page, page_size), request)


@router.get("/teas/{tea_id}", operation_id="getTea")
def get_tea(tea_id: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    return success(tea_public(visible_record(db, tea_id, "teas")), request)


@router.get("/tea-items", operation_id="listTeaItems")
def list_items(request: Request, db: Annotated[Session, Depends(get_db)], tea_id: str | None = None, sku: str | None = Query(None, max_length=64), batch_code: str | None = Query(None, max_length=64), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    records = visible_records(db, "tea-items")
    result = [item_public(r) for r in records if (not tea_id or str(published_payload(r).get("tea_id")) == tea_id) and (not sku or published_payload(r).get("sku") == sku) and (not batch_code or published_payload(r).get("batch_code") == batch_code)]
    return success(paginate(result, page, page_size), request)


@router.get("/tea-items/{tea_item_id}", operation_id="getTeaItem")
def get_item(tea_item_id: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    return success(item_public(visible_record(db, tea_item_id, "tea-items")), request)


def public_match(db: Session, tea_id: str, tea_item_id: str | None, resource: str, projector) -> dict:
    match = match_record(db, tea_id, tea_item_id, resource)
    record = match.pop("record")
    match["record"] = projector(db, record) if record else None
    return match


@router.get("/teas/{tea_id}/effects", operation_id="getTeaEffects")
def effects(tea_id: str, request: Request, db: Annotated[Session, Depends(get_db)], tea_item_id: str | None = None):
    return success(public_match(db, tea_id, tea_item_id, "effects", effect_public), request)


@router.get("/teas/{tea_id}/brewing", operation_id="getTeaBrewing")
def brewing(tea_id: str, request: Request, db: Annotated[Session, Depends(get_db)], tea_item_id: str | None = None):
    return success(public_match(db, tea_id, tea_item_id, "brewing-recipes", brewing_public), request)


@router.get("/teas/{tea_id}/supplies", operation_id="listTeaSupplies")
def supplies(tea_id: str, request: Request, db: Annotated[Session, Depends(get_db)], tea_item_id: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    visible_record(db, tea_id, "teas")
    if tea_item_id:
        item = visible_record(db, tea_item_id, "tea-items")
        if str(published_payload(item)["tea_id"]) != tea_id:
            raise ApiError("VALIDATION_ERROR", 422, "茶品与茶叶不匹配")
    offers = [r for r in visible_records(db, "supply-offers") if (not tea_item_id or str(published_payload(r)["tea_item_id"]) == tea_item_id)]
    items = [supply_public(db, r) for r in offers if str(supply_public(db, r)["tea_id"]) == tea_id]
    data = paginate(items, page, page_size)
    data["availability_notice"] = None if items else "暂无有效货源，请提交咨询"
    return success(data, request)


@router.get("/sources/{source_id}", operation_id="getPublicSource")
def get_source(source_id: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    source = visible_record(db, source_id, "sources")
    payload = published_payload(source)
    data = source_summary(db, source_id) | {"summary": payload.get("summary") if payload.get("rights", {}).get("public_excerpt") else None, "files": []}
    return success(data, request)


@router.get("/files/{file_id}/content", operation_id="getPublicFile")
def get_public_file(file_id: str):
    raise ApiError("FEATURE_NOT_CONFIGURED", 503, "本地联调未配置公开文件存储")


@router.post("/questions", operation_id="createQuestion")
def create_question(body: QuestionCreate, request: Request, db: Annotated[Session, Depends(get_db)], idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None, public_session: Annotated[str | None, Cookie(alias="tea_sequence_public")] = None):
    validate_origin(request)
    pid = principal_id(public_session)
    body_data = body.model_dump(mode="json")
    def operation():
        question = body.question.strip()
        if re.search("\u6cbb\u6108|\u6cbb\u7597|\u7cd6\u5c3f\u75c5|\u964d\u8840\u538b|\u66ff\u4ee3\u836f|\u51cf\u80a5|\u6cbb\u75c5", question):
            status, answer, reason = "boundary", "茶序不提供疾病判断或治疗建议；涉及健康状况请咨询专业人员。", "HEALTH_BOUNDARY"
            citations, tea_id, item_id, intent = [], None, None, body.intent
        elif request.app.state.settings.qa_mode == "off":
            status, answer, reason = "degraded", "问茶服务暂时不可用，你仍可以浏览已发布茶品档案。", "QA_DISABLED"
            citations, tea_id, item_id, intent = [], None, None, body.intent
        else:
            target_prefix = "longjing" if "\u9f99\u4e95" in question else "qimen" if "\u7941\u95e8" in question else None
            recipes = visible_records(db, "brewing-recipes")
            recipe = next((r for r in recipes if target_prefix and (db.get(ContentRecord, str(published_payload(r).get("tea_item_id"))).legacy_id or "").startswith(target_prefix)), None)
            matched = db.get(ContentRecord, str(published_payload(recipe).get("tea_item_id"))) if recipe else None
            if matched and recipe and re.search("\u6ce1|\u6c34\u6e29|\u7b2c\u4e00\u6ce1|\u51b2", question):
                recipe_payload = published_payload(recipe)
                tea_id, item_id, intent = str(recipe_payload["tea_id"]), matched.id, "brewing"
                answer = f"建议使用{recipe_payload['vessel']}，投茶 {recipe_payload['tea_g']['min']}g，水温 {recipe_payload['temperature_c']['min']}°C；具体步骤请打开冲泡方案。"
                citations = [{"source": source_summary(db, str(source_id)), "content_id": recipe.id, "content_revision": recipe.published_revision} for source_id in recipe_payload.get("source_ids", [])]
                status, reason = "answered", None
            else:
                status, answer, reason, citations, tea_id, item_id, intent = "unconfirmed", "现有演示资料不足以确认这个问题，请换一个关于龙井、祁门红茶或冲泡步骤的具体问题。", "INSUFFICIENT_EVIDENCE", [], None, None, body.intent
        return {"id": str(uuid4()), "status": status, "answer": answer, "intent": intent, "tea_id": tea_id, "tea_item_id": item_id, "citations": citations, "related_tea_ids": [tea_id] if tea_id else [], "boundary_notice": "演示回答不替代专业健康建议，也不提供库存与价格承诺。", "reason_code": reason, "created_at": datetime.now(timezone.utc)}
    code, envelope = execute_idempotent(db, request, principal_id=pid, key=idempotency_key, body=body_data, status_code=200, operation=operation)
    return JSONResponse(status_code=code, content=envelope)


@router.post("/inquiries", operation_id="createInquiry")
def create_inquiry(body: InquiryCreate, request: Request, db: Annotated[Session, Depends(get_db)], idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None, public_session: Annotated[str | None, Cookie(alias="tea_sequence_public")] = None):
    validate_origin(request)
    pid = principal_id(public_session)
    if body.consent.notice_version != request.app.state.settings.inquiry_notice_version:
        raise ApiError("NOTICE_CHANGED", 409, "告知文本已更新，请重新阅读并同意")
    value = body.contact.value.strip()
    if body.contact.channel == "phone" and not re.fullmatch(r"\+?\d{7,15}", value):
        raise ApiError("VALIDATION_ERROR", 422, "电话号码格式无效", [{"field": "contact.value", "reason": "phone"}])
    if body.contact.channel == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise ApiError("VALIDATION_ERROR", 422, "邮箱格式无效", [{"field": "contact.value", "reason": "email"}])
    if body.tea_item_id:
        item = visible_record(db, str(body.tea_item_id), "tea-items")
        if body.tea_id and str(published_payload(item)["tea_id"]) != str(body.tea_id):
            raise ApiError("VALIDATION_ERROR", 422, "茶品与茶叶不匹配")
    def operation():
        inquiry = Inquiry(id=str(uuid4()), kind=body.kind, tea_id=str(body.tea_id) if body.tea_id else None, tea_item_id=str(body.tea_item_id) if body.tea_item_id else None, supply_offer_id=str(body.supply_offer_id) if body.supply_offer_id else None, need=body.need.strip(), contact_channel=body.contact.channel, contact_value=value, notice_version=body.consent.notice_version, consent_purpose=body.consent.purpose)
        db.add(inquiry)
        db.flush()
        return {"id": inquiry.id, "status": "new", "submitted_at": inquiry.created_at, "receipt_message": "需求已记录；联系方式不会在回执中回显。"}
    code, envelope = execute_idempotent(db, request, principal_id=pid, key=idempotency_key, body=body.model_dump(mode="json"), status_code=201, operation=operation)
    return JSONResponse(status_code=code, content=envelope)


@router.post("/feedback", operation_id="createFeedback")
def create_feedback(body: FeedbackCreate, request: Request, db: Annotated[Session, Depends(get_db)], idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None, public_session: Annotated[str | None, Cookie(alias="tea_sequence_public")] = None):
    validate_origin(request)
    pid = principal_id(public_session)
    def operation():
        record = Feedback(id=str(uuid4()), target_type=body.target_type, target_id=str(body.target_id), target_version=body.target_version, rating=body.rating, reason=body.reason, principal_id=pid)
        db.add(record); db.flush()
        return {"id": record.id, "accepted": True}
    code, envelope = execute_idempotent(db, request, principal_id=pid, key=idempotency_key, body=body.model_dump(mode="json"), status_code=201, operation=operation)
    return JSONResponse(status_code=code, content=envelope)


@router.post("/events", operation_id="createEvents")
def create_events(body: EventBatchCreate, request: Request, db: Annotated[Session, Depends(get_db)], idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None, public_session: Annotated[str | None, Cookie(alias="tea_sequence_public")] = None):
    validate_origin(request)
    pid = principal_id(public_session)
    def operation():
        accepted = duplicate = 0
        for event in body.events:
            recipe = visible_record(db, str(event.recipe_id), "brewing-recipes")
            if recipe.published_revision != event.recipe_revision:
                raise ApiError("CONTENT_UNAVAILABLE", 409, "冲泡方案版本不可用")
            if db.get(MetricEvent, str(event.event_id)):
                duplicate += 1; continue
            db.add(MetricEvent(event_id=str(event.event_id), event_type=event.event_type, recipe_id=str(event.recipe_id), recipe_revision=event.recipe_revision, brewing_run_id=str(event.brewing_run_id), step_no=event.step_no, occurred_at=event.occurred_at, principal_id=pid)); accepted += 1
        db.flush()
        return {"accepted_count": accepted, "duplicate_count": duplicate}
    code, envelope = execute_idempotent(db, request, principal_id=pid, key=idempotency_key, body=body.model_dump(mode="json"), status_code=200, operation=operation)
    return JSONResponse(status_code=code, content=envelope)
