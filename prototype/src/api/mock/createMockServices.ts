import type { Role } from '../../model';
import { MockAdminApi } from './adminApi';
import { MockPublicApi } from './publicApi';
import { MockStore } from './mockStore';

export const createMockServices = (options: { role?: Role; userId?: string; authenticated?: boolean } = {}) => {
  const store = new MockStore();
  return {
    store,
    publicApi: new MockPublicApi(store),
    admin: new MockAdminApi(store, options.role ?? 'admin', options.userId ?? 'admin-1', options.authenticated ?? true)
  };
};
