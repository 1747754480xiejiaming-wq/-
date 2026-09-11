import type { Lead, Role, TeaItem } from '../../model';
import { ApiError } from '../errors';
import type { AdminUser, ContentCommand, ContentCreate, ContentDetail, ContentEditCommand, ContentQuery, ContentSummary, ExportJob, LeadCommand, LeadDetail, LeadQuery, ReviewCommand, SubmitReviewCommand } from '../types';
import type { LoginInput } from '../services';
import { MockStore } from './mockStore';

const permissions: Record<Role, string[]> = {
  operator: ['content:read', 'content:write', 'imports:write'],
  reviewer: ['content:read', 'reviews:write'],
  lead: ['inquiries:read', 'inquiries:write', 'inquiries:export'],
  admin: ['content:read', 'content:write', 'inquiries:read', 'inquiries:write', 'inquiries:export', 'accounts:write', 'audit:read']
};
const fail = (status: number, code: string, message: string) => new ApiError({ status, code, message });
const detail = (item: TeaItem, author_id = item.id === 'qimen-draft' ? 'author-1' : 'operator-1'): ContentDetail<TeaItem> => ({ ...item, row_version: item.revision, etag: `rv-${item.revision}`, author_id });
const leadDetail = (lead: Lead, version: number): LeadDetail => ({ ...lead, row_version: version, etag: `rv-${version}` });

export class MockAdminApi {
  constructor(private readonly store: MockStore, private role: Role, private userId: string, private authenticated = true) {}

  private requireSession() { if (!this.authenticated) throw fail(401, 'UNAUTHENTICATED', '用户名或密码不正确'); }
  async login(input: LoginInput): Promise<AdminUser> {
    if (input.username !== 'demo' || input.password !== 'demo123456') throw fail(401, 'UNAUTHENTICATED', '用户名或密码不正确');
    this.authenticated = true;
    this.role = 'operator';
    this.userId = 'operator-1';
    return this.getMe();
  }
  async logout() { this.authenticated = false; }
  async getMe(): Promise<AdminUser> { this.requireSession(); return { id: this.userId, role: this.role, permission_codes: permissions[this.role], review_domains: this.role === 'reviewer' ? ['tea_content'] : [] }; }
  async setDemoRole(role: Role): Promise<AdminUser> { this.requireSession(); this.role = role; this.userId = `${role}-1`; return this.getMe(); }

  async getContent(id: string) {
    const item = this.store.snapshot().items.find(value => value.id === id);
    if (!item) throw fail(404, 'NOT_FOUND', '内容不存在');
    return detail(item);
  }
  async listContent(query: ContentQuery = {}): Promise<{ items: ContentSummary[]; page: number; page_size: number; total: number }> {
    if (!permissions[this.role].includes('content:read')) throw fail(403, 'FORBIDDEN', '当前身份无内容查看权限');
    const all = this.store.snapshot().items.filter(item => (!query.status || (item.draftStatus ?? item.status) === query.status) && (!query.q || `${item.name} ${item.sku} ${item.batch}`.includes(query.q)));
    const page = query.page ?? 1, page_size = query.page_size ?? 20;
    return { items: all.slice((page - 1) * page_size, page * page_size).map(item => ({ id: item.id, name: item.name, sku: item.sku, batch: item.batch, status: item.draftStatus ?? item.status, row_version: item.revision, etag: `rv-${item.revision}` })), page, page_size, total: all.length };
  }
  async createDraft(input: ContentCreate) {
    this.requireEditor();
    const base = this.store.snapshot().items[0];
    const stamp = Date.now();
    const item: TeaItem = { ...base, id: `draft-${stamp}`, teaId: input.tea_id, name: input.name.trim(), category: input.category, sku: input.sku, batch: input.batch, status: 'draft', revision: 1, draftStatus: undefined, draftNote: undefined, offer: 'unavailable', description: '新建的原型演示草稿。' };
    this.store.update(state => ({ ...state, items: [item, ...state.items] }));
    return detail(item, this.userId);
  }
  private requireEditor() { if (!permissions[this.role].includes('content:write')) throw fail(403, 'FORBIDDEN', '当前身份无内容管理权限'); }
  private update(input: ContentCommand, mutate: (item: TeaItem, state: ReturnType<MockStore['snapshot']>) => TeaItem) {
    this.requireEditor();
    if (!input.ifMatch) throw fail(428, 'PRECONDITION_REQUIRED', '请先刷新内容版本');
    const state = this.store.snapshot();
    const current = state.items.find(item => item.id === input.id);
    if (!current) throw fail(404, 'NOT_FOUND', '内容不存在');
    if (input.ifMatch !== `rv-${current.revision}`) throw fail(409, 'VERSION_CONFLICT', '内容已更新，请刷新后重试');
    const next = mutate(current, state);
    this.store.update(value => ({ ...value, items: value.items.map(item => item.id === input.id ? next : item) }));
    return detail(next, this.userId);
  }
  async saveDraft(input: ContentEditCommand) {
    return this.update(input, item => {
      const state = item.draftStatus ?? item.status;
      if (state === 'pending_review') throw fail(409, 'INVALID_STATE', '待审核内容不能继续编辑');
      return { ...item, draftNote: input.description, ...(item.status === 'published' ? { draftStatus: 'draft' as const } : { status: 'draft' as const }), revision: item.revision + 1 };
    });
  }
  async submitReview(input: SubmitReviewCommand) {
    return this.update(input, item => {
      const state = item.draftStatus ?? item.status;
      if (state !== 'draft') throw fail(409, 'INVALID_STATE', '仅草稿可以提交审核');
      return { ...item, ...(item.status === 'published' ? { draftStatus: 'pending_review' as const } : { status: 'pending_review' as const }), revision: item.revision + 1 };
    });
  }
  async withdraw(input: ContentCommand) { return this.update(input, item => { if (item.status !== 'published') throw fail(409, 'INVALID_STATE', '仅已发布内容可下架'); return { ...item, status: 'withdrawn', draftStatus: undefined, revision: item.revision + 1 }; }); }
  async relist(input: ContentCommand) {
    const result = this.update(input, item => { if (item.status !== 'withdrawn') throw fail(409, 'INVALID_STATE', '仅已下架内容可重新上架'); return { ...item, status: 'published', revision: item.revision + 1 }; });
    if (!this.store.snapshot().sourceActive) this.store.update(state => ({ ...state, sourceActive: true }));
    return result;
  }
  async delete(input: ContentCommand) {
    const item = await this.getContent(input.id);
    if (this.role !== 'admin' && !(this.role === 'operator' && (item.draftStatus ?? item.status) === 'draft')) throw fail(403, 'FORBIDDEN', '当前身份不能删除此内容');
    if (!input.ifMatch) throw fail(428, 'PRECONDITION_REQUIRED', '请先刷新内容版本');
    if (input.ifMatch !== item.etag) throw fail(409, 'VERSION_CONFLICT', '内容已更新，请刷新后重试');
    this.store.update(state => ({ ...state, items: state.items.filter(value => value.id !== input.id) }));
  }
  async review(input: ReviewCommand) {
    if (!permissions[this.role].includes('reviews:write')) throw fail(403, 'FORBIDDEN', '当前身份无审核权限');
    const item = await this.getContent(input.id);
    if (item.author_id === (input.authorId ?? this.userId)) throw fail(403, 'FORBIDDEN', '不能审核自己修改的版本');
    if ((item.draftStatus ?? item.status) !== 'pending_review') throw fail(409, 'INVALID_STATE', '当前内容不在待审核状态');
    if (!input.ifMatch) throw fail(428, 'PRECONDITION_REQUIRED', '请先刷新内容版本');
    if (input.ifMatch !== item.etag || input.revision !== item.row_version) throw fail(409, 'VERSION_CONFLICT', '内容版本已更新');
    if (input.decision === 'reject' && !input.comment.trim()) throw fail(422, 'VALIDATION_FAILED', '退回时必须填写修改意见');
    if (!this.store.snapshot().sourceActive && input.decision === 'approve') throw fail(409, 'DEPENDENCY_UNAVAILABLE', '来源已撤回，不能发布');
    const next: TeaItem = input.decision === 'approve'
      ? { ...item, status: 'published', draftStatus: undefined, description: item.draftNote || item.description, draftNote: undefined, revision: item.revision + 1 }
      : { ...item, ...(item.status === 'published' ? { draftStatus: 'draft' as const } : { status: 'draft' as const }), revision: item.revision + 1 };
    this.store.update(state => ({ ...state, items: state.items.map(value => value.id === next.id ? next : value) }));
    return detail(next, item.author_id);
  }

  async getSourceActive() { return this.store.snapshot().sourceActive; }
  async setSourceActive(active: boolean) { if (this.role !== 'admin') throw fail(403, 'FORBIDDEN', '仅项目管理员可变更来源'); this.store.update(state => ({ ...state, sourceActive: active })); }
  async listLeads(query: LeadQuery = {}) {
    if (!permissions[this.role].includes('inquiries:read')) throw fail(403, 'FORBIDDEN', '当前身份无线索查看权限');
    const state = this.store.snapshot();
    const all = state.leads.filter(lead => !query.status || lead.status === query.status);
    const page = query.page ?? 1, page_size = query.page_size ?? 20;
    return { items: all.slice((page - 1) * page_size, page * page_size).map(lead => leadDetail(lead, state.leadVersions[lead.id] ?? 1)), page, page_size, total: all.length };
  }
  async updateLead(input: LeadCommand) {
    if (!permissions[this.role].includes('inquiries:write')) throw fail(403, 'FORBIDDEN', '当前身份无线索跟进权限');
    if (!input.ifMatch) throw fail(428, 'PRECONDITION_REQUIRED', '请先刷新线索版本');
    const state = this.store.snapshot();
    const lead = state.leads.find(value => value.id === input.id);
    if (!lead) throw fail(404, 'NOT_FOUND', '线索不存在');
    const version = state.leadVersions[input.id] ?? 1;
    if (input.ifMatch !== `rv-${version}`) throw fail(409, 'VERSION_CONFLICT', '线索已更新，请刷新后重试');
    const allowed: Record<Lead['status'], Lead['status'][]> = { new: ['new', 'assigned', 'contacted', 'closed'], assigned: ['assigned', 'contacted', 'closed'], contacted: ['contacted', 'closed'], closed: ['closed'] };
    if (!allowed[lead.status].includes(input.status)) throw fail(409, 'INVALID_STATE', '线索状态不能回退');
    if (input.status === 'closed' && !input.note.trim()) throw fail(422, 'VALIDATION_FAILED', '关闭前请填写跟进备注');
    const next = { ...lead, status: input.status, note: input.note };
    this.store.update(value => ({ ...value, leads: value.leads.map(current => current.id === input.id ? next : current), leadVersions: { ...value.leadVersions, [input.id]: version + 1 } }));
    return leadDetail(next, version + 1);
  }
  async exportLeads(): Promise<ExportJob> {
    if (!permissions[this.role].includes('inquiries:export')) throw fail(403, 'FORBIDDEN', '当前身份无线索导出权限');
    return { id: crypto.randomUUID(), kind: 'inquiries', state: 'succeeded', created_at: new Date().toISOString(), row_count: this.store.snapshot().leads.length };
  }
  async resetDemo() { this.store.reset(); }
}
