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

  it('maps draft updates and lead transitions to C04 and M03', async () => {
    const { client, request } = fakeClient();
    const api = createLiveAdminApi(client, async () => 'csrf-2');

    await api.saveDraft({ id: 'item-2', description: '避光、密封、干燥保存。', ifMatch: 'rv-4', idempotencyKey: 'edit-1' });
    expect(request).toHaveBeenLastCalledWith({ path: '/admin/content/tea-items/item-2', method: 'PATCH', body: { storage: '避光、密封、干燥保存。' }, csrf: 'csrf-2', ifMatch: 'rv-4', idempotencyKey: 'edit-1' });

    request.mockResolvedValue({ id: 'lead-1', kind: 'sample', status: 'contacted', contact_masked: '138****0001', created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T01:00:00Z', row_version: 2, need: '样品', notes: [] });
    await api.updateLead({ id: 'lead-1', status: 'contacted', note: '已联系', ifMatch: 'rv-1', idempotencyKey: 'lead-1' });
    expect(request).toHaveBeenLastCalledWith({ path: '/admin/inquiries/lead-1', method: 'PATCH', body: { status: 'contacted', note: '已联系' }, csrf: 'csrf-2', ifMatch: 'rv-1', idempotencyKey: 'lead-1' });
  });

  it('maps login through the pre-login CSRF boundary and stores the rotated token', async () => {
    const { client, request } = fakeClient();
    request.mockResolvedValue({ user: { id: 'operator-1', permission_codes: ['content:read', 'content:write'], review_domains: [] }, csrf_token: 'csrf-rotated' });
    const setCsrf = vi.fn();
    const api = createLiveAdminApi(client, async () => 'csrf-prelogin', vi.fn(), setCsrf);

    await expect(api.login({ username: 'operator', password: 'correct-password' })).resolves.toMatchObject({ role: 'operator' });
    expect(request).toHaveBeenCalledWith({ path: '/admin/auth/login', method: 'POST', body: { username: 'operator', password: 'correct-password' }, csrf: 'csrf-prelogin' });
    expect(setCsrf).toHaveBeenCalledWith('csrf-rotated');
  });
});
