/**
 * 邮箱登录（docs/api.md §1）
 *
 *  POST /api/auth/email/start   发验证邮件（当前开关关闭 → 501）
 *  POST /api/auth/email/verify  校验邮件里的 token → upsert users → 下发 sid
 *
 * 开关：`AUTH_EMAIL_ENABLED === 'true'` 才启用；否则**一律 501**。
 * 契约写的是 501，但错误码沿用 `VALIDATION` 语义（任务约定），响应仍是统一包裹。
 */
import type { Context, Handler } from 'hono';
import { setCookie } from 'hono/cookie';
import type { AppEnv } from '../lib/env';
import { fail, ok } from '../lib/response';
import { resolveJwtSecret, signEmailToken, signSession, verifyJwt } from './jwt';
import { SID_COOKIE, SID_MAX_AGE } from './middleware';
import { isAdminEmail, upsertProviderUser } from './users';

/** 与 validate.ts 的邮箱正则同源（此处不引 zod，保持 auth 层零校验依赖） */
const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** 邮件登录是否启用（wrangler.toml [vars] 里默认 false） */
export function emailLoginEnabled(env: Pick<AppEnv['Bindings'], 'AUTH_EMAIL_ENABLED'>): boolean {
  return env.AUTH_EMAIL_ENABLED === 'true';
}

/** 开关关闭时的统一响应：501 + NOT_IMPLEMENTED（与错误码表的 501 对齐） */
function notEnabled(): Response {
  const body = {
    ok: false,
    error: { code: 'NOT_IMPLEMENTED', message: '邮件登录暂未开启，请使用 GitHub 登录' },
  };
  return new Response(JSON.stringify(body), {
    status: 501,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** 发验证信：POST /api/auth/email/start */
export const emailStart: Handler<AppEnv> = async (c) => {
  if (!emailLoginEnabled(c.env)) return notEnabled();

  const body: unknown = await c.req.json().catch(() => undefined);
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).email : undefined;
  if (typeof raw !== 'string' || !EMAIL_RX.test(raw.trim())) {
    return fail('VALIDATION', '邮箱格式不正确', ['email']);
  }

  const email = normalizeEmail(raw);
  const token = await signEmailToken(email, resolveJwtSecret(c.env));

  // TODO(A3 二期)：接 Resend 发信。开关打开前不引真实调用，避免本地误发。
  //   POST https://api.resend.com/emails
  //   Authorization: Bearer ${env.RESEND_API_KEY}
  //   { from, to: email, subject: '登录面试题库',
  //     html: `<a href="${appOrigin}/api/auth/email/verify?token=${token}">点击登录</a>` }
  //   发信失败 → 500 INTERNAL，但**不要**回显 token。
  void token;

  // 不区分邮箱是否已注册，避免账号枚举
  return ok({ sent: true });
};

/** 校验邮件 token：POST /api/auth/email/verify */
export const emailVerify: Handler<AppEnv> = async (c) => {
  if (!emailLoginEnabled(c.env)) return notEnabled();

  const body: unknown = await c.req.json().catch(() => undefined);
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).token : undefined;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fail('VALIDATION', '缺少 token', ['token']);
  }

  const secret = resolveJwtSecret(c.env);
  const payload = await verifyJwt(raw.trim(), secret).catch(() => null);
  if (!payload || payload.purpose !== 'email' || !EMAIL_RX.test(payload.sub)) {
    return fail('UNAUTHORIZED', '登录链接已失效，请重新获取');
  }

  const email = normalizeEmail(payload.sub);
  const result = await upsertProviderUser(
    c.env.DB,
    {
      provider: 'email',
      providerId: email,
      name: email.split('@')[0] || email,
      email,
      avatarUrl: null,
    },
    isAdminEmail(c.env, email),
  );

  const session = await signSession(result.user, secret);
  setCookie(c, SID_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SID_MAX_AGE,
  });

  // 同 logout：必须用 c.json，裸 Response 会丢掉 setCookie 挂上的 Set-Cookie
  return c.json({ ok: true, data: { user: result.user } });
};
