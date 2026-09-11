from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import Field, TypeAdapter

from app.schemas.common import StrictModel


class TeaPayload(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=40)
    aliases: list[str] = []
    origin: str = ""
    process: str = ""
    source_ids: list[UUID] = []


class TeaItemPayload(StrictModel):
    tea_id: UUID
    sku: str = Field(min_length=1, max_length=64)
    batch_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    grade: str = ""
    year: int = Field(ge=1900, le=2100)
    specification: str = ""
    storage: str = ""
    shelf_life_months: int | None = Field(None, ge=1, le=600)
    supplier_id: UUID | None = None
    source_ids: list[UUID] = []
    media_file_ids: list[UUID] = []
    subtitle: str = ""
    taste: list[str] = []
    price: str = ""
    description: str = ""


class EffectPayload(StrictModel):
    tea_id: UUID
    tea_item_id: UUID | None = None
    features: list[str] = []
    scenarios: list[str] = []
    cautions: list[str] = []
    claims: list[dict] = []
    source_ids: list[UUID] = []
    valid_from: str | None = None


class BrewingPayload(StrictModel):
    tea_id: UUID
    tea_item_id: UUID | None = None
    title: str = Field(min_length=1, max_length=120)
    vessel: str = ""
    water_ml: dict = {"min": 150, "max": 150}
    tea_g: dict = {"min": 3, "max": 3}
    temperature_c: dict = {"min": 85, "max": 85}
    water_quality: str = ""
    rinse: bool = False
    steps: list[dict] = []
    adjustments: list[dict] = []
    source_ids: list[UUID] = []
    valid_from: str | None = None


class SupplierPayload(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    supplier_code: str = ""
    cooperation_status: Literal["active", "paused", "ended"] = "active"
    contact: dict = {}
    qualifications: list[UUID] = []
    disclosure: dict = {"public_fields": [], "reviewer_note": ""}
    source_ids: list[UUID] = []


class SupplyOfferPayload(StrictModel):
    tea_item_id: UUID
    supplier_id: UUID
    offer_code: str = ""
    price_mode: Literal["quote_only", "reference"] = "quote_only"
    price: dict | None = None
    inventory_mode: Literal["unknown", "snapshot"] = "unknown"
    quantity: float | None = Field(None, ge=0)
    minimum_order: dict = {"value": 1, "unit": "piece"}
    lead_time_text: str = ""
    ship_from: str = ""
    sample_rule: str = ""
    as_of: str = ""
    valid_from: str = ""
    valid_until: str = ""
    disclosure: dict = {"public_fields": [], "reviewer_note": ""}
    source_ids: list[UUID] = []


class SourcePayload(StrictModel):
    type: Literal["book", "standard", "paper", "report", "expert", "internal"]
    title: str = Field(min_length=1, max_length=120)
    author_or_org: str = ""
    source_date: str | None = None
    summary: str = ""
    file_ids: list[UUID] = []
    rights: dict = {}
    valid_from: str = ""
    valid_until: str | None = None
    revocation_kind: Literal["none", "demo", "external", "legal"] = "none"


Payload = Union[TeaPayload, TeaItemPayload, EffectPayload, BrewingPayload, SupplierPayload, SupplyOfferPayload, SourcePayload]

RESOURCE_ADAPTERS = {
    "teas": TypeAdapter(TeaPayload),
    "tea-items": TypeAdapter(TeaItemPayload),
    "effects": TypeAdapter(EffectPayload),
    "brewing-recipes": TypeAdapter(BrewingPayload),
    "suppliers": TypeAdapter(SupplierPayload),
    "supply-offers": TypeAdapter(SupplyOfferPayload),
    "sources": TypeAdapter(SourcePayload),
}


class ReviewCreate(StrictModel):
    revision: int = Field(ge=1)
    decision: Literal["approve", "reject"]
    comment: str = Field(min_length=1, max_length=1000)


class RevisionCreate(StrictModel):
    base_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)


class SubmitReview(StrictModel):
    revision: int = Field(ge=1)
    comment: str | None = Field(None, max_length=1000)


class LifecycleCreate(StrictModel):
    revision: int = Field(ge=1)
    reason: str | None = Field(None, max_length=1000)
