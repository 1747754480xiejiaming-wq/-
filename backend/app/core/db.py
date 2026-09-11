from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.models.base import Base


def database_url(settings: Settings | None = None) -> str:
    """Return the configured database URL without creating or mutating a database."""
    return (settings or get_settings()).database_url


def create_database_engine(settings: Settings) -> Engine:
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    options: dict[str, object] = {"future": True, "connect_args": connect_args}
    if settings.database_url in {"sqlite://", "sqlite:///:memory:"}:
        options["poolclass"] = StaticPool
    return create_engine(settings.database_url, **options)


def initialize_database(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    raise RuntimeError("get_db must be overridden by create_app")
