from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import Price, PublicVersion, SourceSummary, StrictModel


class QuestionCreate(StrictModel):
    question: str = Field(min_length=1, max_length=1000)
    intent: Literal["general", "brewing"] | None = None
    tea_id: UUID | None = None
    tea_item_id: UUID | None = None

    @model_validator(mode="after")
    def item_requires_tea(self):
        if self.tea_item_id and not self.tea_id:
            raise ValueError("tea_id is required when tea_item_id is set")
        return self


class ContactCreate(StrictModel):
    channel: Literal["phone", "email"]
    value: str = Field(min_length=3, max_length=254)


class ConsentCreate(StrictModel):
    accepted: Literal[True]
    notice_version: str = Field(min_length=1, max_length=40)
    purpose: Literal["inquiry_followup"]


class InquiryCreate(StrictModel):
    kind: Literal["consultation", "sample"]
    tea_id: UUID | None = None
    tea_item_id: UUID | None = None
    supply_offer_id: UUID | None = None
    need: str = Field(min_length=1, max_length=1000)
    contact: ContactCreate
    consent: ConsentCreate

    @model_validator(mode="after")
    def sample_requires_item(self):
        if self.kind == "sample" and not self.tea_item_id:
            raise ValueError("tea_item_id is required for sample")
        return self


class FeedbackCreate(StrictModel):
    target_type: Literal["effect", "brewing", "answer"]
    target_id: UUID
    target_version: int | None = Field(None, ge=1)
    rating: Literal["helpful", "unhelpful"]
    reason: str | None = Field(None, max_length=500)


class EventCreate(StrictModel):
    event_id: UUID
    event_type: Literal["brewing_started", "brewing_step_completed", "brewing_completed"]
    recipe_id: UUID
    recipe_revision: int = Field(ge=1)
    brewing_run_id: UUID
    step_no: int | None = Field(None, ge=1)
    occurred_at: datetime

    @model_validator(mode="after")
    def completed_step_requires_number(self):
        if self.event_type == "brewing_step_completed" and self.step_no is None:
            raise ValueError("step_no is required")
        return self


class EventBatchCreate(StrictModel):
    events: list[EventCreate] = Field(min_length=1, max_length=20)


class InquiryPatch(StrictModel):
    status: Literal["new", "assigned", "contacted", "closed"] | None = None
    assignee_id: UUID | None = None
    note: str | None = Field(None, max_length=1000)
