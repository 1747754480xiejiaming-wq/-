from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import Settings, get_settings
from app.core.errors import ApiError

API_ROOT = "/api/v1"


def meta_for(request: Request) -> dict[str, str]:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return {
        "request_id": request_id,
        "server_time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def success(data: object, request: Request) -> dict[str, object]:
    return {"data": data, "meta": meta_for(request)}


def failure(
    request: Request, code: str, message: str, details: list[dict] | None = None
) -> dict[str, object]:
    return {
        "error": {"code": code, "message": message, "details": details or []},
        "meta": meta_for(request),
    }


def is_api_request(request: Request) -> bool:
    return request.url.path.startswith(API_ROOT)


def validation_details(exc: RequestValidationError) -> list[dict[str, str]]:
    return [
        {
            "field": ".".join(str(part) for part in error["loc"]),
            "reason": str(error["type"]),
        }
        for error in exc.errors()
    ]


def create_app(settings: Settings | None = None) -> FastAPI:
    configured_settings = settings or get_settings()
    app = FastAPI(title=configured_settings.app_name, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(configured_settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-ID"],
    )

    @app.middleware("http")
    async def assign_request_id(request: Request, call_next):
        supplied_request_id = request.headers.get("X-Request-ID")
        try:
            request.state.request_id = str(UUID(supplied_request_id)) if supplied_request_id else str(uuid4())
        except ValueError:
            request.state.request_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=failure(request, exc.code, exc.message, exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if is_api_request(request):
            code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
            message = "资源不存在" if exc.status_code == 404 else "请求无法处理"
            return JSONResponse(status_code=exc.status_code, content=failure(request, code, message))
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        if is_api_request(request):
            return JSONResponse(
                status_code=422,
                content=failure(request, "VALIDATION_ERROR", "请求参数无效", validation_details(exc)),
            )
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
        if is_api_request(request):
            return JSONResponse(
                status_code=500, content=failure(request, "INTERNAL_ERROR", "服务暂时不可用")
            )
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

    @app.get("/health/live", operation_id="getLiveHealth", tags=["health"])
    def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(f"{API_ROOT}/config", operation_id="getPublicConfig", tags=["public"])
    def public_config(
        request: Request,
        request_id: Annotated[UUID | None, Header(alias="X-Request-ID")] = None,
    ) -> dict[str, object]:
        del request_id
        return success(
            {
                "data_mode": "demo",
                "tea_categories": [],
                "inquiry_notice": {
                    "version": configured_settings.inquiry_notice_version,
                    "text": configured_settings.inquiry_notice_text,
                    "purpose": "inquiry_followup",
                },
                "health_notice": {
                    "version": configured_settings.health_notice_version,
                    "text": configured_settings.health_notice_text,
                },
                "capabilities": {"qa": configured_settings.qa_mode != "off"},
            },
            request,
        )

    return app


app = create_app()
