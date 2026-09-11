export type ApiMode = 'mock' | 'live';

export type RuntimeConfig = { mode: ApiMode; baseUrl: string };

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '');

export const readRuntimeConfig = (values: Record<string, string | undefined> = import.meta.env): RuntimeConfig => {
  const mode = values.VITE_API_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'live') throw new Error('VITE_API_MODE 必须为 mock 或 live');
  return { mode, baseUrl: normalizeBaseUrl(values.VITE_API_BASE_URL ?? '/api/v1') };
};

export const newIdempotencyKey = () => crypto.randomUUID();
