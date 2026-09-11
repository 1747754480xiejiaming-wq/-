import type { PublicApi } from '../services';
import { ApiClient } from '../client';

export const createLivePublicApi = (client: ApiClient): PublicApi => ({
  getConfig: () => client.request({ path: '/config' }),
  searchTeas: query => client.request({ path: '/teas', query: { q: query?.q, category: query?.category, page: query?.page ?? 1, page_size: query?.page_size ?? 20 } }),
  getTeaItem: id => client.request({ path: `/tea-items/${id}` }),
  getBrewing: ({ teaId, teaItemId }) => client.request({ path: `/teas/${teaId}/brewing`, query: { tea_item_id: teaItemId } }),
  askQuestion: question => client.request({ path: '/questions', method: 'POST', body: { question }, idempotent: true }),
  createInquiry: input => client.request({ path: '/inquiries', method: 'POST', body: input, idempotent: true })
});
