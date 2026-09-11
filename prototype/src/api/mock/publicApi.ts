import type { TeaItem } from '../../model';
import { ApiError } from '../errors';
import type { ApiPage, SearchHit, TeaItemPublic, TeaSearch } from '../types';
import { MockStore } from './mockStore';

const notFound = () => new ApiError({ status: 404, code: 'NOT_FOUND', message: '内容不存在或当前不可公开' });
const asPublic = (item: TeaItem): TeaItemPublic => ({ ...item, row_version: item.revision, etag: `rv-${item.revision}` });

export class MockPublicApi {
  constructor(private readonly store: MockStore) {}
  private published = () => {
    const state = this.store.snapshot();
    return state.sourceActive ? state.items.filter(item => item.status === 'published') : [];
  };
  async getTeaItem(id: string): Promise<TeaItemPublic> {
    const item = this.published().find(value => value.id === id);
    if (!item) throw notFound();
    return asPublic(item);
  }
  async searchTeas(query: TeaSearch = {}): Promise<ApiPage<SearchHit>> {
    const search = (query.q ?? '').toLowerCase();
    const items = this.published().filter(item =>
      (!query.category || item.category === query.category) &&
      (!search || `${item.name} ${item.sku} ${item.batch}`.toLowerCase().includes(search))
    );
    const page = query.page ?? 1;
    const page_size = query.page_size ?? 20;
    return { items: items.slice((page - 1) * page_size, page * page_size).map(item => ({ id: item.id, teaId: item.teaId, name: item.name, sku: item.sku, batch: item.batch, category: item.category })), page, page_size, total: items.length };
  }
  async isSourceActive() { return this.store.snapshot().sourceActive; }
}
