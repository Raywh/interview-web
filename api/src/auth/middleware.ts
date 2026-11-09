/**
 * 认证中间件（A3）—— 替换原 auth/stub.ts。
 *
 * 登录态来源：`sid` cookie 里的 HS256 JWT（docs/api.md §0）。
 * 校验通过后除了看 JWT，还会回查一次 users 表：
 *   - 用户被删 / 降权能立刻生效，不用等 7 天 cookie 过期
 *   - 代价是每个受保护请求多一次 D1 查询（走主键，成本可接受）
 *
 * 三个中间件：
 *   requireAuth   未登录 → 401 UNAUTHORIZED
 *   requireAdmin  未登录 → 401；非 admin → 403 FORBIDDEN
 *   optionalAuth  有会话就注入 user，没有也放行（GET /api/questions/:id 要用）
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../lib/env';
import { fail } from '../lib/response';
import type { User } from '../types';
import { resolveJwtSecret, verifyJwt } from './jwt';
import { toUser, type UserRow } from './users';

/** 会话 cookie 名（docs/api.md §0） */
export const SID_COOKIE = 'sid';

/** 会话 cookie 有效期：7 天，单位秒 */
export const SID_MAX_AGE = 7 * 24 * 60 * 60;

/** 从 sid cookie 解析当前用户；任何失败都返回 undefined，不抛异常 */
async function resolveUser(c: Context<AppEnv>): Promise<User | undefined> {
  const token = getCookie(c, SID_COOKIE);
  if (!token) return undefined;

  let payload;
  try {
    payload = await verifyJwt(token, resolveJwtSecret(c.env));
  } catch (err) {
    console.error('[auth] verify sid failed', err);
    return undefined;
  }
  // state / email 用途的 token 不能当会话用
  if (!payload || payload.purpose !== 'session') return undefined;

  try {
    const row = await c.env.DB.prepare(
      'SELECT id, name, email, avatar_url, role, created_at FROM users WHERE id = ?',
    )
      .bind(payload.sub)
      .first<UserRow>();
    if (!row) return undefined;
    return toUser(row);
  } catch (err) {
    console.error('[auth] load user failed', err);
    return undefined;
  }
}

/** 需要登录：未登录直接 401 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  // 前面已经挂过 optionalAuth 时不重复查库
  const user = c.get('user') ?? (await resolveUser(c));
  if (!user) return fail('UNAUTHORIZED', '请先登录');
  c.set('user', user);
  await next();
};

/** 需要管理员：未登录 401，非 admin 403 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user') ?? (await resolveUser(c));
  if (!user) return fail('UNAUTHORIZED', '请先登录');
  if (user.role !== 'admin') return fail('FORBIDDEN', '需要管理员权限');
  c.set('user', user);
  await next();
};

/** 可选登录：有会话注入 user，没有也放行（不拦截游客） */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveUser(c);
  if (user) c.set('user', user);
  await next();
};
