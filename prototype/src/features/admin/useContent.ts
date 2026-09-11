import { useCallback, useState } from 'react';
import type { ItemStatus, Role } from '../../model';
import { ApiError } from '../../api/errors';
import { newIdempotencyKey } from '../../api/runtime';
import type { ContentCreate } from '../../api/types';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

const normalize = (error: unknown) => error instanceof ApiError ? error : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用，请稍后重试' });

export function useContent(role: Role, query: { q?: string; status?: ItemStatus } = {}) {
  const { adminApi } = useAppServices();
  const [busy, setBusy] = useState('');
  const [mutationError, setMutationError] = useState<ApiError>();
  const load = useCallback(async () => {
    const page = await adminApi.listContent({ ...query, page_size: 100 });
    const [items, sourceActive] = await Promise.all([Promise.all(page.items.map(item => adminApi.getContent(item.id))), adminApi.getSourceActive()]);
    return { ...page, items, sourceActive };
  }, [adminApi, query.q, query.status, role]);
  const state = useRemoteState(load, value => value.items.length === 0);
  const run = useCallback(async <T,>(key: string, action: () => Promise<T>) => {
    setBusy(key); setMutationError(undefined);
    try { const result = await action(); state.reload(); return result; }
    catch (error) { const next = normalize(error); setMutationError(next); throw next; }
    finally { setBusy(''); }
  }, [state.reload]);
  return {
    ...state,
    busy,
    mutationError,
    clearError: () => setMutationError(undefined),
    create: (input: ContentCreate) => run('create', () => adminApi.createDraft(input)),
    save: (input: { id: string; description: string; etag: string }) => run(input.id, () => adminApi.saveDraft({ id: input.id, description: input.description, ifMatch: input.etag, idempotencyKey: newIdempotencyKey() })),
    submit: (input: { id: string; revision: number; etag: string; comment?: string }) => run(input.id, () => adminApi.submitReview({ id: input.id, revision: input.revision, comment: input.comment, ifMatch: input.etag, idempotencyKey: newIdempotencyKey() })),
    withdraw: (input: { id: string; etag: string }) => run(input.id, () => adminApi.withdraw({ id: input.id, ifMatch: input.etag, idempotencyKey: newIdempotencyKey(), reason: '后台商品管理下架' })),
    relist: (input: { id: string; etag: string }) => run(input.id, () => adminApi.relist({ id: input.id, ifMatch: input.etag, idempotencyKey: newIdempotencyKey(), reason: '后台商品管理重新上架' })),
    remove: (input: { id: string; etag: string }) => run(input.id, () => adminApi.delete({ id: input.id, ifMatch: input.etag, idempotencyKey: newIdempotencyKey(), reason: '后台商品管理删除' })),
    setSourceActive: (active: boolean) => run('source', () => adminApi.setSourceActive(active))
  };
}

export function useContentDetail(role: Role, id: string) {
  const { adminApi } = useAppServices();
  const load = useCallback(() => adminApi.getContent(id), [adminApi, id, role]);
  return useRemoteState(load);
}
