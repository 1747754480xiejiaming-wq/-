import { useCallback, useState } from 'react';
import type { Lead, Role } from '../../model';
import { ApiError } from '../../api/errors';
import { newIdempotencyKey } from '../../api/runtime';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export function useLeads(role: Role, status?: Lead['status']) {
  const { adminApi } = useAppServices();
  const [busy, setBusy] = useState('');
  const [mutationError, setMutationError] = useState<ApiError>();
  const load = useCallback(() => adminApi.listLeads({ status, page_size: 100 }), [adminApi, role, status]);
  const state = useRemoteState(load, value => value.items.length === 0);
  const run = async <T,>(key: string, action: () => Promise<T>) => {
    setBusy(key); setMutationError(undefined);
    try { const result = await action(); state.reload(); return result; }
    catch (error) { const next = error instanceof ApiError ? error : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '线索服务暂时不可用' }); setMutationError(next); throw next; }
    finally { setBusy(''); }
  };
  return {
    ...state,
    busy,
    mutationError,
    update: (input: { id: string; status: Lead['status']; note: string; etag: string }) => run(input.id, () => adminApi.updateLead({ ...input, ifMatch: input.etag, idempotencyKey: newIdempotencyKey() })),
    export: () => run('export', () => adminApi.exportLeads({ status, page_size: 100 }))
  };
}
