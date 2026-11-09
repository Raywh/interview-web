/**
 * GitHub OAuth（docs/api.md §1）
 *
 *  GET /api/auth/github            302 到 GitHub 授权页，state 是 5 分钟有效的签名 JWT
 *  GET /api/auth/github/callback   校验 state → 换 token → 拉 profile/emails →
 *                                  upsert users → 签 7 天会话 → Set-Cookie sid → 302 回 APP_ORIGIN
 *  失败一律 302 到 `${APP_ORIGIN}/?login=error&reason=<code>`（契约要求，不返回 JSON）
 *
 * 挂在 /api/auth 下，路径由 routes/auth.ts 指定。
 */
import type { Context, Handler } from 'hono';
import { setCookie } from 'hono/cookie';
import type { AppEnv } from '../lib/env';
import { resolveJwtSecret, signSession, signState, verifyJwt } from './jwt';
import { SID_COOKIE, SID_MAX_AGE } from './middleware';
import { isAdminEmail, upsertProviderUser } from './users';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';
/** 拉用户的邮箱需要 user:email；read:user 拿公开资料 */
const GITHUB_SCOPE = 'read:user user:email';

interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** 站点 origin：APP_ORIGIN 优先，没配就退回请求 origin（同源部署时等价） */
export function appOrigin(c: Context<AppEnv>): string {
  const configured = typeof c.env.APP_ORIGIN === 'string' ? c.env.APP_ORIGIN.trim() : '';
  if (configured) return configured.replace(/\/+$/, '');
  return new URL(c.req.url).origin;
}

function loginError(c: Context<AppEnv>, reason: string): Response {
  return c.redirect(`${appOrigin(c)}/?login=error&reason=${encodeURIComponent(reason)}`, 302);
}

function callbackUrl(c: Context<AppEnv>): string {
  return `${new URL(c.req.url).origin}/api/auth/github/callback`;
}

/** 第一步：302 到 GitHub 授权页 */
export const githubStart: Handler<AppEnv> = async (c) => {
  const clientId = typeof c.env.GITHUB_CLIENT_ID === 'string' ? c.env.GITHUB_CLIENT_ID.trim() : '';
  if (!clientId) {
    // 本地 dev 没配 secret 也要能看到「路由已接上」：照样 302，由 GitHub 报 client_id 错误。
    console.warn('[auth.github] GITHUB_CLIENT_ID 未配置，OAuth 无法真正完成');
  }

  const state = await signState(resolveJwtSecret(c.env));
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl(c));
  url.searchParams.set('scope', GITHUB_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');

  return c.redirect(url.toString(), 302);
};

/** 用 code 换 access_token */
async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'user-agent': 'interview-web',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as
    | { access_token?: unknown; error?: unknown }
    | null;
  const token = data?.access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

async function githubGet<T>(path: string, accessToken: string): Promise<T | null> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'interview-web',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** 主邮箱：先找 primary+verified，再退到任意 verified；都不行用 profile.email */
async function pickEmail(profile: GithubProfile, accessToken: string): Promise<string | null> {
  const emails = await githubGet<GithubEmail[]>('/user/emails', accessToken);
  if (Array.isArray(emails)) {
    const verified = emails.filter((item) => item && item.verified && typeof item.email === 'string');
    const primary = verified.find((item) => item.primary);
    if (primary) return primary.email;
    if (verified.length > 0 && verified[0]) return verified[0].email;
  }
  return profile.email ?? null;
}

/** 第二步：回调 */
export const githubCallback: Handler<AppEnv> = async (c) => {
  const errorParam = c.req.query('error');
  if (errorParam) return loginError(c, errorParam);

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code) return loginError(c, 'missing_code');
  if (!state) return loginError(c, 'missing_state');

  const secret = resolveJwtSecret(c.env);
  const statePayload = await verifyJwt(state, secret).catch(() => null);
  if (!statePayload || statePayload.purpose !== 'state') return loginError(c, 'invalid_state');

  const clientId = (c.env.GITHUB_CLIENT_ID ?? '').trim();
  const clientSecret = (c.env.GITHUB_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret) {
    console.error('[auth.github] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 未配置');
    return loginError(c, 'not_configured');
  }

  const accessToken = await exchangeCode(clientId, clientSecret, code, callbackUrl(c)).catch(() => null);
  if (!accessToken) return loginError(c, 'token_exchange');

  const profile = await githubGet<GithubProfile>('/user', accessToken).catch(() => null);
  if (!profile || typeof profile.id !== 'number') return loginError(c, 'profile_fetch');

  const email = await pickEmail(profile, accessToken).catch(() => null);
  const name = (profile.name && profile.name.trim()) || profile.login || `github-${profile.id}`;

  let user;
  try {
    const result = await upsertProviderUser(
      c.env.DB,
      {
        provider: 'github',
        providerId: String(profile.id),
        name,
        email,
        avatarUrl: profile.avatar_url ?? null,
      },
      isAdminEmail(c.env, email),
    );
    user = result.user;
  } catch (err) {
    console.error('[auth.github] upsert user failed', err);
    return loginError(c, 'user_upsert');
  }

  const session = await signSession(user, secret);
  setCookie(c, SID_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SID_MAX_AGE,
  });

  return c.redirect(appOrigin(c), 302);
};
