from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.auth import router as auth_router, users_router
from app.api.content import router as content_router
from app.api.inquiries import router as inquiries_router
from app.api.imports import router as imports_router
from app.api.public import router as public_router
from app.core.config import Settings, get_settings
from app.core.db import create_database_engine, get_db, initialize_database, session_factory
from app.core.errors import ApiError
from app.main_support import failure, meta_for, success

API_ROOT = "/api/v1"


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
    engine = create_database_engine(configured_settings)
    initialize_database(engine)
    make_session = session_factory(engine)
    app.state.settings = configured_settings
    app.state.engine = engine

    def database_dependency():
        with make_session() as db:
            yield db

    app.dependency_overrides[get_db] = database_dependency
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
        response: Response,
        request_id: Annotated[UUID | None, Header(alias="X-Request-ID")] = None,
    ) -> dict[str, object]:
        del request_id
        if not request.cookies.get("tea_sequence_public"):
            response.set_cookie("tea_sequence_public", str(uuid4()), httponly=True, secure=configured_settings.cookie_secure, samesite="lax", max_age=86400)
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

    @app.get("/health/ready", operation_id="getReadyHealth", tags=["health"])
    def ready() -> dict[str, str]:
        return {"status": "ready"}

    app.include_router(auth_router, prefix=API_ROOT)
    app.include_router(users_router, prefix=API_ROOT)
    app.include_router(content_router, prefix=API_ROOT)
    app.include_router(inquiries_router, prefix=API_ROOT)
    app.include_router(imports_router, prefix=API_ROOT)
    app.include_router(public_router, prefix=API_ROOT)

    return app


app = create_app()
