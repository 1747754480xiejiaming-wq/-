export type PublicVersionTransport = {
  revision: number;
  published_at: string;
  updated_at: string;
  reviewer_label: string;
};

export type SearchHitTransport = {
  entity_type: 'tea' | 'tea_item';
  id: string;
  tea_id: string;
  tea_item_id?: string;
  name: string;
  category: string;
  sku?: string;
  batch_code?: string;
};

export type TeaItemTransport = {
  id: string;
  tea_id: string;
  sku: string;
  batch_code: string;
  name: string;
  grade: string;
  year: number;
  specification: string;
  storage: string;
  shelf_life_months?: number;
  images: Array<{ id: string; filename: string; content_type: string }>;
  version: PublicVersionTransport;
};

export type TeaTransport = { id: string; name: string; category: string; aliases: string[]; origin: string; process: string; version: PublicVersionTransport };

export type RangeTransport = { min: number; max: number };
export type SourceSummaryTransport = { id: string; type: 'book'|'standard'|'paper'|'report'|'expert'|'internal'; title: string; author_or_org?: string; source_date?: string; revision: number };
export type MatchTransport<T> = { requested: { tea_id: string; tea_item_id?: string }; match_level: 'tea_item'|'tea'|'none'; fallback_reason?: 'no_item_record'|'item_record_unavailable'; record: T|null; notice?: string };
export type BrewingTransport = { id: string; tea_id: string; tea_item_id?: string; title: string; vessel: string; water_ml: RangeTransport; tea_g: RangeTransport; temperature_c: RangeTransport; water_quality: string; rinse: boolean; steps: Array<{ step_no: number; title: string; instruction: string; duration_seconds: number; infusion_no?: number }>; adjustments: Array<{ condition: 'too_strong'|'too_weak'|'bitter'|'low_aroma'; instruction: string }>; sources: SourceSummaryTransport[]; version: PublicVersionTransport };
export type AnswerTransport = { id: string; status: 'answered'|'unconfirmed'|'boundary'|'degraded'; answer: string; intent?: 'general'|'brewing'; tea_id?: string; tea_item_id?: string; citations: Array<{ source: SourceSummaryTransport; content_id: string; content_revision: number }>; related_tea_ids: string[]; boundary_notice: string; reason_code?: string; created_at: string };
export type InquiryCreateTransport = { kind: 'consultation'|'sample'; tea_id?: string; tea_item_id?: string; supply_offer_id?: string; need: string; contact: { channel: 'phone'|'email'; value: string }; consent: { accepted: true; notice_version: string; purpose: 'inquiry_followup' } };
export type InquiryReceiptTransport = { id: string; status: 'new'; submitted_at: string; receipt_message: string };
