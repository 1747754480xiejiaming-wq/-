from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class ContentRecord(Base):
    __tablename__ = "content_records"
    __table_args__ = (UniqueConstraint("resource", "legacy_id", name="uq_resource_legacy_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    legacy_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    resource: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(120), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    row_version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    published_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    publication_state: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    created_by: Mapped[str] = mapped_column(String(36), index=True)
    updated_by: Mapped[str] = mapped_column(String(36), index=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    demo_source_withdrawn: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ContentRevision(Base):
    __tablename__ = "content_revisions"
    __table_args__ = (UniqueConstraint("content_id", "revision", name="uq_content_revision"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    content_id: Mapped[str] = mapped_column(String(36), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict] = mapped_column(JSON)
    updated_by: Mapped[str] = mapped_column(String(36))
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
