import { config } from '@/config/env';
import { getAccessToken } from '@/services/tokenStore';

/**
 * Thin fetch wrapper for calls to OUR backend.
 *
 * Deliberately small: the access token is read from an in-memory store at call
 * time (never from localStorage), nothing is cached, and credentials are not
 * sent cross-origin.
 */

interface RequestOptions {
  query?: Record<string, string>;
  signal?: AbortSignal;
  body?: unknown;
  /** Idempotency key for writes, so a retry cannot create a duplicate record. */
  idempotencyKey?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason from the server, e.g. SESSION_ACTIVE or SESSION_REPLACED. */
    readonly code?: string,
    /** The whole error body, for callers that need more than the message. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildUrl(path: string, query?: Record<string, string>): string {
  const base = path.startsWith('http') ? path : `${config.apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return base;
  const qs = new URLSearchParams(query).toString();
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

/** Builds an error carrying the backend's own reason ("Employee ID or password is incorrect.") when it sent one. */
async function toApiError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* no JSON body */
  }
  const code = typeof body.code === 'string' ? body.code : undefined;
  if (typeof body.message === 'string' && body.message.trim() !== '') return new ApiError(body.message, res.status, code, body);
  const fallback =
    res.status === 401
      ? 'Your session has expired. Please sign in again.'
      : res.status === 403
        ? 'You do not have permission to do that.'
        : res.status >= 500
          ? 'The server ran into a problem. Please try again.'
          : `Request failed (${res.status}).`;
  return new ApiError(fallback, res.status, code, body);
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      cache: 'no-store',
      credentials: 'omit',
      signal: opts.signal,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the Teacher Portal server. Check that it is running and try again.', 0);
  }

  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts);
export const apiPost = <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts);
