import type { ItemStatus, Lead, Role, TeaItem } from '../model';
import type { Page } from './contracts';

export type TeaItemPublic = TeaItem & { row_version: number; etag: string };
export type ContentDetail<T> = T & { row_version: number; etag: string; author_id: string };
export type ContentSummary = Pick<ContentDetail<TeaItemPublic>, 'id' | 'name' | 'sku' | 'batch' | 'status' | 'row_version' | 'etag'>;
export type ContentQuery = { status?: ItemStatus; q?: string; page?: number; page_size?: number };
export type ContentCommand = { id: string; ifMatch?: string; idempotencyKey: string; reason?: string };
export type ReviewCommand = ContentCommand & { revision: number; decision: 'approve' | 'reject'; comment: string; authorId?: string };
export type AdminUser = { id: string; role: Role; permission_codes: string[]; review_domains: string[] };
export type InquiryReceipt = Pick<Lead, 'id' | 'status'> & { submitted_at: string; receipt_message: string };
export type TeaSearch = { q?: string; category?: string; page?: number; page_size?: number };
export type SearchHit = Pick<TeaItemPublic, 'id' | 'teaId' | 'name' | 'sku' | 'batch' | 'category'>;
export type ApiPage<T> = Page<T>;
