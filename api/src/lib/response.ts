/**
 * 统一响应包裹（docs/api.md §0）
 *
 *  成功：{ ok: true,  data: ... }            → 200
 *  失败：{ ok: false, error: { code, message, reasons? } } → 契约规定的错误码状态
 *
 * 用法（Hono handler 直接 return）：
 *   return ok(data)
 *   return fail('VALIDATION', '标题不能为空', ['title'])
 */
import type { ApiErr, ApiErrorCode, ApiOk } from '../types';

/** 错误码 → HTTP 状态码（docs/api.md §0 错误码表，唯一映射） */
const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // API 响应一律不缓存：会话/角色变了要立刻生效，别让浏览器拿旧副本
      'cache-control': 'no-store',
    },
  });
}

/** 成功包裹，HTTP 200 */
export function ok<T>(data: T): Response {
  const body: ApiOk<T> = { ok: true, data };
  return json(body, 200);
}

/** 失败包裹，HTTP 状态码由 code 决定（reasons 可选，给字段名 / 限流窗口） */
export function fail(code: ApiErrorCode, message: string, reasons?: string[]): Response {
  const error: ApiErr['error'] =
    reasons && reasons.length > 0 ? { code, message, reasons } : { code, message };
  return json({ ok: false, error } satisfies ApiErr, ERROR_STATUS[code]);
}
