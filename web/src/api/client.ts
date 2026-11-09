/**
 * fetch 封装 —— 与 Worker 同源，cookie 会话。
 * 统一解析 { ok, data } / { ok: false, error } 包裹（docs/api.md §0）。
 */
import type {
  ApiErrorCode,
  ApiResponse,
  Page,
  Question,
  QuestionSummary,
  Stats,
} from './types';

const API_BASE = '/api';

/** 非契约错误码：网络失败 / 响应不是约定的 JSON 包裹 */
export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'INVALID_RESPONSE';

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly reasons: string[];

  constructor(code: ClientErrorCode, message: string, status = 0, reasons: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.reasons = reasons;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('NETWORK', '无法连接服务器，请检查网络后重试');
  }

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (!payload || typeof payload.ok !== 'boolean') {
    throw new ApiError(
      'INVALID_RESPONSE',
      res.ok ? '服务返回了无法解析的数据' : `请求失败（HTTP ${res.status}）`,
      res.status,
    );
  }

  if (!payload.ok) {
    throw new ApiError(
      payload.error.code,
      payload.error.message,
      res.status,
      payload.error.reasons ?? [],
    );
  }

  return payload.data;
}

export interface QuestionListParams {
  category?: string;
  /** 关键词（标题/正文包含） */
  q?: string;
  page?: number;
  pageSize?: number;
}

/** GET /api/questions?category=&page=&pageSize= */
export function getQuestions(params: QuestionListParams = {}): Promise<Page<QuestionSummary>> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));

  const query = qs.toString();
  return request<Page<QuestionSummary>>(`/questions${query ? `?${query}` : ''}`);
}

/** GET /api/questions/:id */
export function getQuestion(id: string): Promise<Question> {
  return request<Question>(`/questions/${encodeURIComponent(id)}`);
}

/** GET /api/stats */
export function getStats(): Promise<Stats> {
  return request<Stats>('/stats');
}
