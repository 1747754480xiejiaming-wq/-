import csv
import io
import json
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import Principal, require_csrf, require_principal
from app.main_support import success
from app.models.job import ImportJob
from app.services.audit import append_audit
from app.services.catalog import paginate
from app.services.content import RESOURCE_ADAPTERS, content_detail, create_content
from app.services.idempotency import execute_idempotent, require_key

router = APIRouter(tags=["admin-imports"])


class ImportCommit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    validation_version: int
    mode: Literal["create_only", "upsert_draft"]


def require_imports(principal: Principal) -> None:
    if not principal.has("imports:write"):
        raise ApiError("FORBIDDEN", 403, "无权导入内容")


def job_data(job: ImportJob) -> dict:
    return {"id": job.id, "resource": job.resource, "schema_version": job.schema_version, "state": job.state, "total_rows": job.total_rows, "error_rows": job.error_rows, "warning_rows": job.warning_rows, "validation_version": job.validation_version, "created_count": job.created_count, "updated_count": job.updated_count, "created_at": job.created_at, "finished_at": job.finished_at, "failure_code": job.failure_code}


TEMPLATE_COLUMNS = {
    "teas": ["name", "category", "aliases", "origin", "process", "source_ids"],
    "tea-items": ["tea_id", "sku", "batch_code", "name", "grade", "year", "specification", "storage", "shelf_life_months", "supplier_id", "source_ids"],
    "effects": ["tea_id", "tea_item_id", "features", "scenarios", "cautions", "claims", "source_ids", "valid_from"],
    "brewing-recipes": ["tea_id", "tea_item_id", "title", "vessel", "water_ml", "tea_g", "temperature_c", "water_quality", "rinse", "steps", "adjustments", "source_ids", "valid_from"],
    "suppliers": ["name", "supplier_code", "cooperation_status", "contact", "qualifications", "disclosure", "source_ids"],
    "supply-offers": ["tea_item_id", "supplier_id", "offer_code", "price_mode", "price", "inventory_mode", "minimum_order", "as_of", "valid_from", "valid_until", "disclosure", "source_ids"],
    "sources": ["type", "title", "author_or_org", "source_date", "summary", "file_ids", "rights", "valid_from", "valid_until", "revocation_kind"],
}


@router.get("/admin/import-templates/{resource}", operation_id="getImportTemplate")
def template(resource: str, format: str, principal: Principal = Depends(require_principal)):
    require_imports(principal)
    if resource not in TEMPLATE_COLUMNS or format != "csv":
        raise ApiError("FEATURE_NOT_CONFIGURED", 503, "本地联调只提供七类资源的 CSV 模板")
    buffer = io.StringIO(); writer = csv.writer(buffer); writer.writerow(["schema_version", *TEMPLATE_COLUMNS[resource]])
    return Response(content="\ufeff" + buffer.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{resource}-v1.csv"'})


def decode_cell(key: str, value: str):
    stripped = value.strip()
    if not stripped: return None if key.endswith("_id") or key in {"valid_until", "source_date", "shelf_life_months"} else [] if key.endswith("_ids") or key in {"aliases", "features", "scenarios", "cautions", "claims", "steps", "adjustments", "qualifications"} else ""
    if key in {"year", "shelf_life_months"}: return int(stripped)
    if key == "rinse": return stripped.lower() in {"1", "true", "yes"}
    if key.endswith("_ids") or key in {"aliases", "features", "scenarios", "cautions", "claims", "steps", "adjustments", "qualifications", "contact", "disclosure", "water_ml", "tea_g", "temperature_c", "price", "minimum_order", "rights"}: return json.loads(stripped)
    return stripped


@router.post("/admin/imports", status_code=202, operation_id="createImport")
async def create_import(request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), file: UploadFile = File(), resource: str = Form(), schema_version: str = Form(), idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    require_imports(principal); require_key(idempotency_key)
    if resource not in TEMPLATE_COLUMNS or not file.filename or not file.filename.lower().endswith(".csv"):
        raise ApiError("UNSUPPORTED_FILE", 422, "仅接受所选资源的 UTF-8 CSV 文件")
    raw = await file.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024: raise ApiError("FILE_TOO_LARGE", 413, "导入文件不能超过 10MiB")
    try: text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc: raise ApiError("INVALID_ENCODING", 422, "CSV 必须使用 UTF-8") from exc
    reader = csv.DictReader(io.StringIO(text)); rows, errors = [], []
    for row_no, row in enumerate(reader, 2):
        if row_no > 5001: raise ApiError("TOO_MANY_ROWS", 422, "导入数据不能超过 5000 行")
        if any(value and value[:1] in {"=", "+", "-", "@", "\t", "\r"} for value in row.values()):
            errors.append({"row": row_no, "column": "*", "code": "FORMULA_NOT_ALLOWED", "message": "不接受公式或公式前缀"}); continue
        try:
            payload = {key: decode_cell(key, value or "") for key, value in row.items() if key != "schema_version"}
            RESOURCE_ADAPTERS[resource].validate_python(payload); rows.append(payload)
        except Exception:
            errors.append({"row": row_no, "column": "*", "code": "VALIDATION_ERROR", "message": "字段格式或必填值无效"})
    job = ImportJob(id=str(uuid4()), resource=resource, schema_version=schema_version, state="invalid" if errors else "validated", total_rows=len(rows) + len(errors), error_rows=len(errors), rows=rows, errors=errors, created_by=principal.user.id)
    db.add(job); append_audit(db, actor_id=principal.user.id, action="import_validated", resource=resource, object_id=job.id, request_id=request.state.request_id, summary=f"导入校验：{job.total_rows} 行，{job.error_rows} 行错误"); db.commit()
    return success(job_data(job), request)


@router.get("/admin/imports/{import_id}", operation_id="getImport")
def get_import(import_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal)):
    require_imports(principal); job = db.get(ImportJob, import_id)
    if not job or job.created_by != principal.user.id and principal.user.role != "admin": raise ApiError("NOT_FOUND", 404, "导入任务不存在")
    return success(job_data(job), request)


@router.get("/admin/imports/{import_id}/errors", operation_id="listImportErrors")
def import_errors(import_id: str, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_principal), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    require_imports(principal); job = db.get(ImportJob, import_id)
    if not job or job.created_by != principal.user.id and principal.user.role != "admin": raise ApiError("NOT_FOUND", 404, "导入任务不存在")
    return success(paginate(job.errors, page, page_size), request)


@router.post("/admin/imports/{import_id}/commit", status_code=202, operation_id="commitImport")
def commit_import(import_id: str, body: ImportCommit, request: Request, db: Annotated[Session, Depends(get_db)], principal: Principal = Depends(require_csrf), idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None):
    require_imports(principal); job = db.get(ImportJob, import_id)
    if not job or job.created_by != principal.user.id and principal.user.role != "admin": raise ApiError("NOT_FOUND", 404, "导入任务不存在")
    if job.state != "validated" or job.validation_version != body.validation_version: raise ApiError("VERSION_CONFLICT", 409, "导入校验结果已变化，请重新校验")
    def operation():
        job.state = "committing"
        for row in job.rows: create_content(db, job.resource, row, principal.user.id)
        job.created_count = len(job.rows); job.state = "committed"; from app.models.base import utcnow; job.finished_at = utcnow()
        append_audit(db, actor_id=principal.user.id, action="import_committed", resource=job.resource, object_id=job.id, request_id=request.state.request_id, summary=f"导入生成 {job.created_count} 条草稿"); db.flush(); return job_data(job)
    code, envelope = execute_idempotent(db, request, principal_id=principal.user.id, key=idempotency_key, body=body.model_dump(mode="json"), status_code=202, operation=operation)
    return JSONResponse(status_code=code, content=envelope)
