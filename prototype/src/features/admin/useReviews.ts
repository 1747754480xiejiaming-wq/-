import { useCallback, useState } from 'react';
import type { Role } from '../../model';
import { ApiError } from '../../api/errors';
import { newIdempotencyKey } from '../../api/runtime';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export function useReviews(role: Role) {
  const { adminApi } = useAppServices();
  const [busy, setBusy] = useState('');
  const [mutationError, setMutationError] = useState<ApiError>();
  const load = useCallback(async () => {
    const page = await adminApi.listContent({ status: 'pending_review', page_size: 100 });
    return { ...page, items: await Promise.all(page.items.map(item => adminApi.getContent(item.id))) };
  }, [adminApi, role]);
  const state = useRemoteState(load, value => value.items.length === 0);
  const review = async (input: { id: string; revision: number; etag: string; decision: 'approve' | 'reject'; comment: string }) => {
    setBusy(input.id); setMutationError(undefined);
    try {
      const result = await adminApi.review({ ...input, ifMatch: input.etag, idempotencyKey: newIdempotencyKey() });
      state.reload();
      return result;
    } catch (error) {
      const next = error instanceof ApiError ? error : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '审核服务暂时不可用' });
      setMutationError(next); throw next;
    } finally { setBusy(''); }
  };
  return { ...state, busy, mutationError, review };
}
