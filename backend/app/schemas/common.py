from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PageParams(StrictModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class SourceSummary(StrictModel):
    id: UUID
    type: Literal["book", "standard", "paper", "report", "expert", "internal"]
    title: str
    author_or_org: str | None = None
    source_date: str | None = None
    revision: int = Field(ge=1)


class PublicVersion(StrictModel):
    revision: int = Field(ge=1)
    published_at: datetime
    updated_at: datetime
    reviewer_label: str


class Price(StrictModel):
    amount: str = Field(pattern=r"^\d+(\.\d{1,2})?$")
    currency: Literal["CNY"] = "CNY"
    unit: Literal["g", "kg", "piece"]
    tax_included: bool
    shipping_included: bool
