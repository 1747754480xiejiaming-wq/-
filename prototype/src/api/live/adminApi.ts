import { ApiClient } from '../client';
import { ApiError } from '../errors';
import type { AdminApi } from '../services';
import type { ContentCommand, ReviewCommand } from '../types';

export const createLiveAdminApi = (client: ApiClient, getCsrf: () => Promise<string>, clearCsrf: () => void = () => undefined): AdminApi => {
  const command = async <T>(input: Parameters<ApiClient['request']>[0]) => {
    try {
      return await client.request<T>({ ...input, csrf: await getCsrf() });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') clearCsrf();
      throw error;
    }
  };
  return ({
  getMe: () => client.request({ path: '/admin/auth/me' }),
  getContent: id => client.request({ path: `/admin/content/tea-items/${id}` }),
  listContent: query => client.request({ path: '/admin/content/tea-items', query }),
  withdraw: (input: ContentCommand) => command({ path: `/admin/content/tea-items/${input.id}/withdraw`, method: 'POST', body: { revision: Number(input.ifMatch?.replace('rv-', '')), reason: input.reason ?? '前端发起下架' }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
  relist: (input: ContentCommand) => command({ path: `/admin/content/tea-items/${input.id}/relist`, method: 'POST', body: { revision: Number(input.ifMatch?.replace('rv-', '')), reason: input.reason }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }),
  delete: async (input: ContentCommand) => { await command<void>({ path: `/admin/content/tea-items/${input.id}`, method: 'DELETE', body: { reason: input.reason ?? '前端发起删除' }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey }); },
  review: (input: ReviewCommand) => command({ path: `/admin/content/tea-items/${input.id}/review`, method: 'POST', body: { revision: input.revision, decision: input.decision, comment: input.comment }, ifMatch: input.ifMatch, idempotencyKey: input.idempotencyKey })
  });
};
