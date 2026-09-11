from dataclasses import dataclass
from functools import lru_cache
import os


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    database_url: str
    cors_origins: tuple[str, ...]
    qa_mode: str
    inquiry_notice_version: str
    inquiry_notice_text: str
    health_notice_version: str
    health_notice_text: str


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
        qa_mode=os.getenv("QA_MODE", "off"),
        inquiry_notice_version=os.getenv("INQUIRY_NOTICE_VERSION", "demo-2026-09"),
        inquiry_notice_text=os.getenv(
            "INQUIRY_NOTICE_TEXT", "提交咨询即表示同意我们仅为本次咨询跟进使用您的联系方式。"
        ),
        health_notice_version=os.getenv("HEALTH_NOTICE_VERSION", "demo-2026-09"),
        health_notice_text=os.getenv("HEALTH_NOTICE_TEXT", "本服务不提供医疗诊断或治疗建议。"),
    )
