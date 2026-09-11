import type { Lead, Role, TeaItem } from '../../model';
import { ApiClient } from '../client';
import type { Page } from '../contracts';
import { ApiError } from '../errors';
import type { AdminApi } from '../services';
import type { LoginInput } from '../services';
import type { AdminUser, ContentCommand, ContentCreate, ContentDetail, ContentEditCommand, ContentQuery, ContentSummary, ExportJob, LeadCommand, LeadDetail, LeadQuery, ReviewCommand, SubmitReviewCommand } from '../types';

type AdminUserTransport = { id: string; permission_codes: string[]; review_domains: string[] };
type InquirySummaryTransport = { id: string; kind: 'consultation' | 'sample'; tea_id?: string; tea_item_id?: string; status: Lead['status']; contact_masked: string; created_at: string; updated_at: string; row_version: number };
type InquiryDetailTransport = InquirySummaryTransport & { need: string; notes: Array<{ text: string; actor_id: string; created_at: string }> };

const inferRole = (user: AdminUserTransport): Role => user.permission_codes.includes('accounts:write') ? 'admin' : user.permission_codes.includes('reviews:write') ? 'reviewer' : user.permission_codes.includes('inquiries:read') ? 'lead' : 'operator';
const fromUser = (user: AdminUserTransport): AdminUser => ({ ...user, role: inferRole(user) });
const fromLead = (lead: InquirySummaryTransport | InquiryDetailTransport): LeadDetail => ({
  id: lead.id,
  name: '已脱敏访客',
  contact: lead.contact_masked,
  item: lead.tea_item_id ?? lead.tea_id ?? '未关联茶品',
  kind: lead.kind === 'sample' ? '样品申请' : '茶品咨询',
  status: lead.status,
  date: new Date(lead.created_at).toLocaleString('zh-CN'),
  note: 'notes' in lead ? lead.notes.at(-1)?.text ?? lead.need : '',
  row_version: lead.row_version,
  etag: `rv-${lead.row_version}`
});

export const createLiveAdminApi = (client: ApiClient, getCsrf: () => Promise<string>, clearCsrf: () => void = () => undefined, setCsrf: (token: string) => void = () => undefined): AdminApi => {
  const command = async <T>(input: Parameters<ApiClient['request']>[0]) => {
    try {
      return await client.request<T>({ ...input, csrf: await getCsrf() });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') clearCsrf();
      throw error;
    }
  };
  const getMe = async () => fromUser(await client.request<AdminUserTransport>({ path: '/admin/auth/me' }));
  return {
    login: async (input: LoginInput) => {
      const payload = await client.request<{ user: AdminUserTransport; csrf_token: string }>({ path: '/admin/auth/login', method: 'POST', body: input, csrf: await getCsrf() });
      setCsrf(payload.csrf_token);
      return fromUser(payload.user);
    },
    logout: async () => { await command<void>({ path: '/admin/auth/logout', method: 'POST' }); clearCsrf(); },
    getMe,
    setDemoRole: () => getMe(),
    getContent: id => client.request<ContentDetail<TeaItem>>({ path: `/admin/content/tea-items/${id}` }),
    listContent: query => client.request<Page<ContentSummary>>({ path: '/admin/content/tea-items', query }),
    createDraft: (input: ContentCreate) => command({ path: '/admin/content/tea-items', method: 'POST', body: { tea_id: input.tea_id, sku: input.sku, batch_code: input.batch, name: input.name }, idempotencyKey: crypto.randomUUID() }),
    saveDraft: (input: ContentEditCommand) => command({ path: `/admin/content/tea-items/${input.id}`, method: 'PATCH', body: { storage: input.description }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
    submitReview: (input: SubmitReviewCommand) => command({ path: `/admin/content/tea-items/${input.id}/submit-review`, method: 'POST', body: { revision: input.revision, comment: input.comment }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
    withdraw: (input: ContentCommand) => command({ path: `/admin/content/tea-items/${input.id}/withdraw`, method: 'POST', body: { revision: Number(input.ifMatch?.replace('rv-', '')), reason: input.reason ?? '前端发起下架' }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
    relist: (input: ContentCommand) => command({ path: `/admin/content/tea-items/${input.id}/relist`, method: 'POST', body: { revision: Number(input.ifMatch?.replace('rv-', '')), reason: input.reason }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
    delete: async (input: ContentCommand) => { await command<void>({ path: `/admin/content/tea-items/${input.id}`, method: 'DELETE', body: { reason: input.reason ?? '前端发起删除' }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }); },
    review: (input: ReviewCommand) => command({ path: `/admin/content/tea-items/${input.id}/review`, method: 'POST', body: { revision: input.revision, decision: input.decision, comment: input.comment }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
    getSourceActive: async () => true,
    setSourceActive: async () => { throw new ApiError({ status: 422, code: 'UNSUPPORTED_DEMO_ACTION', message: 'live 模式不提供演示来源开关，请在正式来源资源中维护授权。' }); },
    listLeads: async (query: LeadQuery = {}) => {
      const page = await client.request<Page<InquirySummaryTransport>>({ path: '/admin/inquiries', query });
      return { ...page, items: page.items.map(fromLead) };
    },
    updateLead: async (input: LeadCommand) => fromLead(await command<InquiryDetailTransport>({ path: `/admin/inquiries/${input.id}`, method: 'PATCH', body: { status: input.status, note: input.note }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey })),
    exportLeads: (query: LeadQuery = {}) => command<ExportJob>({ path: '/admin/exports', method: 'POST', body: { kind: 'inquiries', filters: query, format: 'csv' }, idempotencyKey: crypto.randomUUID() }),
    resetDemo: async () => { throw new ApiError({ status: 422, code: 'UNSUPPORTED_DEMO_ACTION', message: 'live 模式不能重置服务端数据。' }); }
  };
};
