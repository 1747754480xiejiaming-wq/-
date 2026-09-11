import { ApiFailure, ApiSuccess, isApiFailure, isApiSuccess } from './contracts';
import { ApiError, serviceUnavailable } from './errors';
import { newIdempotencyKey } from './runtime';

export type RequestInput = {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  csrf?: string;
  ifMatch?: string;
  idempotent?: boolean;
  idempotencyKey?: string;
};

export type ApiClientOptions = { baseUrl: string; fetcher?: typeof fetch };

const toUrl = (baseUrl: string, path: string, query?: RequestInput['query']) => {
  const url = new URL(`${baseUrl}${path}`, 'http://chaxu.local');
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  return baseUrl.startsWith('http') ? url.toString() : `${url.pathname}${url.search}`;
};

const retryAfterSeconds = (value: string | null) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

const errorFromFailure = (status: number, failure: ApiFailure, retryAfter?: number) => new ApiError({
  status,
  code: failure.error.code,
  message: failure.error.message,
  details: failure.error.details,
  requestId: failure.meta.request_id,
  retryAfterSeconds: retryAfter
});

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch;
  }

  async request<T>(input: RequestInput): Promise<T> {
    const method = input.method ?? 'GET';
    const headers = new Headers({ Accept: 'application/json' });
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.csrf) headers.set('X-CSRF-Token', input.csrf);
    if (input.ifMatch) headers.set('If-Match', input.ifMatch);
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    else if (input.idempotent) headers.set('Idempotency-Key', newIdempotencyKey());

    let response: Response;
    try {
      response = await this.fetcher(toUrl(this.baseUrl, input.path, input.query), {
        method,
        credentials: 'include',
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body)
      });
    } catch {
      throw serviceUnavailable();
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw serviceUnavailable(response.ok ? '服务返回了无法识别的响应' : '服务暂时不可用，请稍后重试');
    }

    const payload: unknown = await response.json();
    if (isApiFailure(payload)) {
      throw errorFromFailure(response.status, payload, retryAfterSeconds(response.headers.get('retry-after')));
    }
    if (!response.ok) throw serviceUnavailable();
    if (!isApiSuccess<T>(payload)) throw serviceUnavailable('服务返回了无法识别的数据');
    return payload.data;
  }
}
