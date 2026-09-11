import type { Role, TeaItem } from '../../model';
import { ApiError } from '../errors';
import type { AdminUser, ContentDetail, ContentQuery, ContentSummary, ReviewCommand, ContentCommand } from '../types';
import { MockStore } from './mockStore';

const permissions: Record<Role, string[]> = { operator: ['content:read', 'content:write', 'imports:write'], reviewer: ['content:read', 'reviews:write'], lead: ['inquiries:read', 'inquiries:export'], admin: ['content:read', 'content:write', 'accounts:write', 'audit:read'] };
const fail = (status: number, code: string, message: string) => new ApiError({ status, code, message });
const detail = (item: TeaItem, author_id = item.id === 'qimen-draft' ? 'author-1' : 'operator-1'): ContentDetail<TeaItem> => ({ ...item, row_version: item.revision, etag: `rv-${item.revision}`, author_id });

export class MockAdminApi {
  constructor(private readonly store: MockStore, private readonly role: Role, private readonly userId: string) {}
  async getMe(): Promise<AdminUser> { return { id: this.userId, role: this.role, permission_codes: permissions[this.role], review_domains: this.role === 'reviewer' ? ['tea_content'] : [] }; }
  async getContent(id: string) {
    const item = this.store.snapshot().items.find(value => value.id === id);
    if (!item) throw fail(404, 'NOT_FOUND', '内容不存在');
    return detail(item);
  }
  async listContent(query: ContentQuery = {}): Promise<{ items: ContentSummary[]; page: number; page_size: number; total: number }> {
    const all = this.store.snapshot().items.filter(item => (!query.status || item.status === query.status) && (!query.q || `${item.name} ${item.sku}`.includes(query.q)));
    const page = query.page ?? 1, page_size = query.page_size ?? 20;
    return { items: all.slice((page - 1) * page_size, page * page_size).map(item => ({ id: item.id, name: item.name, sku: item.sku, batch: item.batch, status: item.status, row_version: item.revision, etag: `rv-${item.revision}` })), page, page_size, total: all.length };
  }
  async setSourceActive(active: boolean) { if (this.role !== 'admin') throw fail(403, 'FORBIDDEN', '仅项目管理员可变更来源'); this.store.update(state => ({ ...state, sourceActive: active })); }
  private requireEditor() { if (this.role !== 'operator' && this.role !== 'admin') throw fail(403, 'FORBIDDEN', '当前身份无内容管理权限'); }
  private update(input: ContentCommand, mutate: (item: TeaItem, state: ReturnType<MockStore['snapshot']>) => TeaItem) {
    this.requireEditor();
    if (!input.ifMatch) throw fail(428, 'PRECONDITION_REQUIRED', '请先刷新内容版本');
    const state = this.store.snapshot();
    const current = state.items.find(item => item.id === input.id);
    if (!current) throw fail(404, 'NOT_FOUND', '内容不存在');
    if (input.ifMatch !== `rv-${current.revision}`) throw fail(409, 'VERSION_CONFLICT', '内容已更新，请刷新后重试');
    const next = mutate(current, state);
    this.store.update(value => ({ ...value, items: value.items.map(item => item.id === input.id ? next : item) }));
    return detail(next);
  }
  async withdraw(input: ContentCommand) { return this.update(input, item => { if (item.status !== 'published') throw fail(409, 'INVALID_STATE', '仅已发布内容可下架'); return { ...item, status: 'withdrawn', revision: item.revision + 1 }; }); }
  async relist(input: ContentCommand) { return this.update(input, (item, state) => { if (item.status !== 'withdrawn') throw fail(409, 'INVALID_STATE', '仅已下架内容可重新上架'); if (!state.sourceActive) this.store.update(value => ({ ...value, sourceActive: true })); return { ...item, status: 'published', revision: item.revision + 1 }; }); }
  async delete(input: ContentCommand) {
    const item = await this.getContent(input.id);
    if (this.role !== 'admin' && !(this.role === 'operator' && item.status === 'draft')) throw fail(403, 'FORBIDDEN', '当前身份不能删除此内容');
    this.update(input, current => ({ ...current, status: 'withdrawn', revision: current.revision + 1 }));
  }
  async review(input: ReviewCommand) {
    if (this.role !== 'reviewer') throw fail(403, 'FORBIDDEN', '当前身份无审核权限');
    const item = await this.getContent(input.id);
    if (item.author_id === (input.authorId ?? this.userId)) throw fail(403, 'FORBIDDEN', '不能审核自己修改的版本');
    if (item.status !== 'pending_review') throw fail(409, 'INVALID_STATE', '当前内容不在待审核状态');
    if (input.revision !== item.row_version) throw fail(409, 'VERSION_CONFLICT', '内容版本已更新');
    const next = { ...item, status: input.decision === 'approve' ? 'published' as const : 'draft' as const, revision: item.revision + 1 };
    this.store.update(state => ({ ...state, items: state.items.map(value => value.id === next.id ? next : value) }));
    return detail(next, item.author_id);
  }
}
