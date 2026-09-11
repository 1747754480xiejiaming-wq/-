export type ApiErrorDetail = { field: string; reason: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details ?? [];
    this.requestId = input.requestId;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export const serviceUnavailable = (message = '服务暂时不可用，请稍后重试') => new ApiError({
  status: 503,
  code: 'SERVICE_UNAVAILABLE',
  message
});
