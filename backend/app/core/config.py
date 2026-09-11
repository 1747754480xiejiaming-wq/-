from dataclasses import dataclass
from functools import lru_cache
import os


@dataclass(frozen=True)
class Settings:
    app_name: str = "Tea Sequence API"
    environment: str = "development"
    database_url: str = "sqlite:///./tea_sequence.db"
    cors_origins: tuple[str, ...] = ("http://127.0.0.1:4173", "http://localhost:4173")
    qa_mode: str = "rules"
    inquiry_notice_version: str = "demo-2026-09"
    inquiry_notice_text: str = "提交咨询即表示同意我们仅为本次咨询跟进使用您的联系方式。"
    health_notice_version: str = "demo-2026-09"
    health_notice_text: str = "本服务不提供医疗诊断或治疗建议。"
    session_cookie_name: str = "tea_sequence_session"
    session_hours: int = 8
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Tea Sequence API"),
        environment=os.getenv("ENVIRONMENT", "development"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./tea_sequence.db"),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS", "http://127.0.0.1:4173,http://localhost:4173"
            ).split(",")
            if origin.strip()
        ),
        qa_mode=os.getenv("QA_MODE", "rules"),
        inquiry_notice_version=os.getenv("INQUIRY_NOTICE_VERSION", "demo-2026-09"),
        inquiry_notice_text=os.getenv(
            "INQUIRY_NOTICE_TEXT", "提交咨询即表示同意我们仅为本次咨询跟进使用您的联系方式。"
        ),
        health_notice_version=os.getenv("HEALTH_NOTICE_VERSION", "demo-2026-09"),
        health_notice_text=os.getenv("HEALTH_NOTICE_TEXT", "本服务不提供医疗诊断或治疗建议。"),
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "tea_sequence_session"),
        session_hours=int(os.getenv("SESSION_HOURS", "8")),
        cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    )
