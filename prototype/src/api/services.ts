import type { Lead, TeaItem } from '../model';
import type { ContentCommand, ContentDetail, ContentQuery, ContentSummary, ReviewCommand, TeaSearch, TeaItemPublic } from './types';
import type { Page } from './contracts';

export type PublicConfig = { data_mode: 'demo' | 'live'; tea_categories: Array<{ code: string; label: string }>; inquiry_notice: { version: string; text: string; purpose: string }; health_notice: { version: string; text: string }; capabilities: { qa: boolean } };
export type BrewingRecipe = { tea_id: string; tea_item_id?: string; vessel: string; water_ml: number; tea_g: number; temperature_c: number; steps: Array<{ title: string; description: string; seconds?: number }> };
export type QuestionResult = { status: 'answered' | 'unconfirmed' | 'boundary' | 'degraded'; text: string; intent?: 'brewing'; tea_item_id?: string; tea_id?: string };
export type InquiryInput = { tea_item_id: string; kind: 'consultation' | 'sample'; contact_channel: 'phone' | 'email'; contact: string; need: string; consent_version: string; consented: boolean };
export type TeaItemQuery = { tea_id?: string; sku?: string; batch_code?: string; page?: number; page_size?: number };

export interface PublicApi {
  getConfig(): Promise<PublicConfig>;
  searchTeas(query?: TeaSearch): Promise<Page<TeaItem>>;
  listTeaItems(query?: TeaItemQuery): Promise<Page<TeaItem>>;
  getTeaItem(id: string): Promise<TeaItem>;
  getBrewing(input: { teaId: string; teaItemId?: string }): Promise<BrewingRecipe>;
  askQuestion(question: string): Promise<QuestionResult>;
  createInquiry(input: InquiryInput): Promise<{ id: string; status: 'new'; submitted_at: string; receipt_message: string }>;
}

export interface AdminApi {
  getMe(): Promise<{ id: string; role: string; permission_codes: string[]; review_domains: string[] }>;
  getContent(id: string): Promise<ContentDetail<TeaItem>>;
  listContent(query?: ContentQuery): Promise<Page<ContentSummary>>;
  withdraw(input: ContentCommand): Promise<ContentDetail<TeaItem>>;
  relist(input: ContentCommand): Promise<ContentDetail<TeaItem>>;
  delete(input: ContentCommand): Promise<void>;
  review(input: ReviewCommand): Promise<ContentDetail<TeaItem>>;
}
