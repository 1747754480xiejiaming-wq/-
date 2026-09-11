import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, RequestInput } from '../client';
import { createLiveAdminApi } from './adminApi';
import { createLivePublicApi } from './publicApi';

const fakeClient = () => {
  const request = vi.fn<(input: RequestInput) => Promise<unknown>>().mockResolvedValue({});
  return { client: { request } as unknown as ApiClient, request };
};

describe('live API endpoint mapping', () => {
  it('maps brewing identifiers to U07 snake_case parameters', async () => {
    const { client, request } = fakeClient();
    request.mockResolvedValue({
      requested: { tea_id: 'tea-1', tea_item_id: 'item-1' },
      match_level: 'tea_item',
      record: { tea_id: 'tea-1', tea_item_id: 'item-1', vessel: '盖碗', water_ml: { min: 150, max: 150 }, tea_g: { min: 5, max: 5 }, temperature_c: { min: 90, max: 90 }, steps: [] }
    });
    const api = createLivePublicApi(client);

    await api.getBrewing({ teaId: 'tea-1', teaItemId: 'item-1' });

    expect(request).toHaveBeenCalledWith({
      path: '/teas/tea-1/brewing',
      query: { tea_item_id: 'item-1' }
    });
  });

  it('maps review commands with CSRF, ETag and the caller idempotency key', async () => {
    const { client, request } = fakeClient();
    const getCsrf = vi.fn().mockResolvedValue('csrf-1');
    const api = createLiveAdminApi(client, getCsrf);

    await api.review({ id: 'item-1', revision: 3, decision: 'approve', comment: '资料完整', ifMatch: 'rv-3', idempotencyKey: 'command-1' });

    expect(request).toHaveBeenCalledWith({
      path: '/admin/content/tea-items/item-1/review',
      method: 'POST',
      body: { revision: 3, decision: 'approve', comment: '资料完整' },
      csrf: 'csrf-1',
      ifMatch: 'rv-3',
      idempotencyKey: 'command-1'
    });
  });
});
