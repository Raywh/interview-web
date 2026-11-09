/**
 * 认证路由 —— 挂载在 /api/auth（docs/api.md §1）
 *
 *  GET  /github           302 → GitHub 授权页（auth/github.ts）
 *  GET  /github/callback  回调（auth/github.ts）
 *  POST /email/start      邮件登录发信（auth/email.ts，默认 501）
 *  POST /email/verify     邮件登录校验（auth/email.ts，默认 501）
 *  POST /logout           清 sid cookie
 *  GET  /me               当前用户；未登录 401 UNAUTHORIZED
 */
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { emailStart, emailVerify } from '../auth/email';
import { githubCallback, githubStart } from '../auth/github';
import { optionalAuth, SID_COOKIE } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { fail, ok } from '../lib/response';

export const authRoute = new Hono<AppEnv>();

// GitHub OAuth
authRoute.get('/github', githubStart);
authRoute.get('/github/callback', githubCallback);

// 邮箱登录（AUTH_EMAIL_ENABLED !== 'true' 时两个端点都返回 501）
authRoute.post('/email/start', emailStart);
authRoute.post('/email/verify', emailVerify);

/** 退出：清 cookie。不要求已登录（重复调用也返回 ok） */
authRoute.post('/logout', (c) => {
  deleteCookie(c, SID_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });
  // 这里必须用 c.json 而不是 lib/response 的 ok()：ok() 返回的是裸 Response，
  // Hono 只把 c.header()/setCookie() 写进 c.json / c.body / c.redirect 的响应，
  // 裸 Response 会把 Set-Cookie 丢掉（实测），导致「退出登录」清不掉 cookie。
  return c.json({ ok: true, data: { loggedOut: true } });
});

/** 当前登录用户：未登录 401（契约 §1） */
authRoute.get('/me', optionalAuth, (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');
  return ok(user);
});
