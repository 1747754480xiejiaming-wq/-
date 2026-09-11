from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
        request.state.request_id = request.headers.get("X-Request-ID") or str(uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {"code": exc.code, "message": exc.message, "details": exc.details},
                "meta": meta_for(request),
            },
        )

    @app.get("/health/live", operation_id="getLiveHealth", tags=["health"])
    def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(f"{API_ROOT}/config", operation_id="getPublicConfig", tags=["public"])
    def public_config(request: Request) -> dict[str, object]:
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
