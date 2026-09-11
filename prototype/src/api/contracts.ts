export type ApiMeta = { request_id: string; server_time: string };

export type ApiSuccess<T> = { data: T; meta: ApiMeta };

export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details: Array<{ field: string; reason: string }>;
  };
  meta: ApiMeta;
};

export type Page<T> = { items: T[]; page: number; page_size: number; total: number };

export const isApiFailure = (value: unknown): value is ApiFailure =>
  typeof value === 'object' && value !== null && 'error' in value && 'meta' in value;

export const isApiSuccess = <T>(value: unknown): value is ApiSuccess<T> =>
  typeof value === 'object' && value !== null && 'data' in value && 'meta' in value;
