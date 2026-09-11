import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/errors';

export type RemoteState<T> = { status: 'loading' | 'ready' | 'empty' | 'error'; data?: T; error?: ApiError; reload: () => void };

export function useRemoteState<T>(load: () => Promise<T>, isEmpty: (value: T) => boolean = () => false): RemoteState<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<Omit<RemoteState<T>, 'reload'>>({ status: 'loading' });
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void load().then(data => active && setState({ status: isEmpty(data) ? 'empty' : 'ready', data })).catch((error: unknown) => {
      const normalized = error instanceof ApiError ? error : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用，请稍后重试' });
      if (active) setState({ status: 'error', error: normalized });
    });
    return () => { active = false; };
  }, [isEmpty, load, revision]);
  return { ...state, reload };
}
