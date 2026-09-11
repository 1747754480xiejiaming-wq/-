import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';

const success = (data: unknown) => new Response(JSON.stringify({
  data,
  meta: { request_id: 'request-1', server_time: '2026-09-11T08:00:00Z' }
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('ApiClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serializes query parameters and includes cookie credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ items: [], page: 1, page_size: 20, total: 0 }));
    const client = new ApiClient({ baseUrl: '/api/v1' });

    await client.request({ path: '/teas', query: { page: 1, page_size: 20 } });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/teas?page=1&page_size=20', expect.objectContaining({
      credentials: 'include',
      method: 'GET'
    }));
  });

  it('adds idempotency keys and turns API errors into ApiError', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: '请稍后再试', details: [] },
      meta: { request_id: 'request-2', server_time: '2026-09-11T08:00:00Z' }
    }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } }));
    const client = new ApiClient({ baseUrl: '/api/v1' });

    await expect(client.request({ path: '/questions', method: 'POST', body: { question: '怎么泡' }, idempotent: true }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get('Idempotency-Key')).toMatch(/^.+$/);
  });
});
