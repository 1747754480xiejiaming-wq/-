import { ApiClient } from './client';
import { createLiveAdminApi } from './live/adminApi';
import { createLivePublicApi } from './live/publicApi';
import { createMockServices } from './mock/createMockServices';
import type { AdminApi, PublicApi } from './services';
import type { RuntimeConfig } from './runtime';

export type AppServices = { publicApi: PublicApi; adminApi: AdminApi; mode: RuntimeConfig['mode'] };

export const createServices = (config: RuntimeConfig): AppServices => {
  if (config.mode === 'mock') {
    const mock = createMockServices({ role: 'operator', userId: 'operator-1' });
    return { publicApi: mock.publicApi, adminApi: mock.admin, mode: 'mock' };
  }
  const client = new ApiClient({ baseUrl: config.baseUrl });
  let csrf = '';
  const getCsrf = async () => {
    if (csrf) return csrf;
    const payload = await client.request<{ csrf_token: string }>({ path: '/admin/auth/csrf' });
    csrf = payload.csrf_token;
    return csrf;
  };
  const clearCsrf = () => { csrf = ''; };
  return { publicApi: createLivePublicApi(client), adminApi: createLiveAdminApi(client, getCsrf, clearCsrf), mode: 'live' };
};
