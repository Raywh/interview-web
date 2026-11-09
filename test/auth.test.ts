/**
 * 认证测试（零依赖，node:test）
 *
 * 运行：node --test test/auth.test.ts
 *
 * 用 Hono 自带的内存请求能力 + 假 D1 绑定，真跑一遍中间件：
 *   - requireAuth / requireAdmin / optionalAuth 的 401 / 403 / 放行
 *   - JWT 签发 / 验签 / 过期 / 篡改 / purpose 串用
 * 真实 OAuth 回调（GitHub 换 token、Resend 发信）没法在这里验证。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Hono } from 'hono';

import {
  SESSION_TTL_SECONDS,
  signSession,
  signState,
  verifyJwt,
} from '../api/src/auth/jwt.ts';
import type { AppEnv } from '../api/src/lib/env.ts';
import { currentUser } from '../api/src/lib/env.ts';

// 仓库里的 API 源码用无扩展名相对导入（wrangler/esbuild 才认），
// Node 直跑 .ts 需要这条回退钩子；见 test/ts-resolve.mjs。
register(new URL('./ts-resolve.mjs', import.meta.url));
const { optionalAuth, requireAdmin, requireAuth, SID_COOKIE } = await import(
  '../api/src/auth/middleware.ts'
);

const SECRET = 'test-secret-0123456789';
const USER_ID = 'u_TESTUSER';

interface FakeRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  created_at: number;
}

const baseRow: FakeRow = {
  id: USER_ID,
  name: '测试用户',
  email: null,
  avatar_url: null,
  role: 'user',
  created_at: 1,
};

/** 假 D1：prepare(...).bind(...).first() 直接返回给定行 */
function fakeDb(row: FakeRow | null): unknown {
  const statement = {
    bind: () => statement,
    first: async () => row,
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  };
  return { prepare: () => statement };
}

function makeEnv(row: FakeRow | null): AppEnv['Bindings'] {
  return { DB: fakeDb(row), JWT_SECRET: SECRET } as unknown as AppEnv['Bindings'];
}

function buildApp(row: FakeRow | null) {
  const app = new Hono<AppEnv>();

  app.get('/me', optionalAuth, (c) => {
    const user = currentUser(c);
    return c.json({ hasUser: Boolean(user), id: user?.id ?? null });
  });
  app.get('/private', requireAuth, (c) => c.json({ ok: true }));
  app.get('/admin', requireAdmin, (c) => c.json({ ok: true }));

  return { app, env: makeEnv(row) };
}

function sidCookie(token: string): string {
  return `${SID_COOKIE}=${token}`;
}

test('JWT：会话签发后可验签，载荷含 purpose=session 且 7 天有效', async () => {
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  const payload = await verifyJwt(token, SECRET);
  assert.ok(payload);
  assert.equal(payload.sub, USER_ID);
  assert.equal(payload.role, 'user');
  assert.equal(payload.purpose, 'session');
  assert.equal(payload.exp - payload.iat, SESSION_TTL_SECONDS);
  assert.equal(SESSION_TTL_SECONDS, 7 * 24 * 60 * 60);
});

test('JWT：换密钥 / 篡改载荷 / 过期都验不过', async () => {
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);

  assert.equal(await verifyJwt(token, 'another-secret-0123456789'), null);

  const [header, body, signature] = token.split('.');
  const forged = `${header}.${body}.${signature?.slice(0, -2) ?? ''}AA`;
  assert.equal(await verifyJwt(forged, SECRET), null);

  const expired = await signSession({ id: USER_ID, role: 'user' }, SECRET, Date.now() - 8 * 24 * 3600 * 1000);
  assert.equal(await verifyJwt(expired, SECRET), null);

  assert.equal(await verifyJwt('not-a-jwt', SECRET), null);
  assert.equal(await verifyJwt(undefined, SECRET), null);
});

test('JWT：state 只有 5 分钟寿命，且 purpose 不能当会话用', async () => {
  const state = await signState(SECRET);
  const payload = await verifyJwt(state, SECRET);
  assert.ok(payload);
  assert.equal(payload.purpose, 'state');
  assert.equal(payload.exp - payload.iat, 300);

  const stale = await signState(SECRET, Date.now() - 10 * 60 * 1000);
  assert.equal(await verifyJwt(stale, SECRET), null);
});

test('requireAuth：无 cookie → 401 UNAUTHORIZED', async () => {
  const { app, env } = buildApp(baseRow);
  const res = await app.request('/private', {}, env);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('requireAdmin：普通用户 → 403 FORBIDDEN', async () => {
  const { app, env } = buildApp(baseRow);
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  const res = await app.request('/admin', { headers: { cookie: sidCookie(token) } }, env);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
});

test('requireAdmin：admin 用户放行（角色以库里的为准）', async () => {
  const { app, env } = buildApp({ ...baseRow, role: 'admin' });
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  const res = await app.request('/admin', { headers: { cookie: sidCookie(token) } }, env);
  assert.equal(res.status, 200);
});

test('requireAuth：库里用户已不存在 → 401（不认过期会话）', async () => {
  const { app, env } = buildApp(null);
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  const res = await app.request('/private', { headers: { cookie: sidCookie(token) } }, env);
  assert.equal(res.status, 401);
});

test('optionalAuth：没登录也放行，并注入 user', async () => {
  const { app, env } = buildApp(baseRow);

  const anon = await app.request('/me', {}, env);
  assert.equal(anon.status, 200);
  assert.deepEqual(await anon.json(), { hasUser: false, id: null });

  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  const logged = await app.request('/me', { headers: { cookie: sidCookie(token) } }, env);
  assert.equal(logged.status, 200);
  assert.deepEqual(await logged.json(), { hasUser: true, id: USER_ID });
});

test('把 state token 当会话 cookie 用 → 不认（purpose 隔离）', async () => {
  const { app, env } = buildApp(baseRow);
  const state = await signState(SECRET);
  const res = await app.request('/private', { headers: { cookie: sidCookie(state) } }, env);
  assert.equal(res.status, 401);
});

// ── 真实 authRoute 集成（挂到 /api/auth，与 index.ts 一致）──────────

const { authRoute } = await import('../api/src/routes/auth.ts');

function buildAuthApp() {
  const app = new Hono<AppEnv>();
  app.route('/api/auth', authRoute);
  const env = {
    DB: fakeDb(baseRow),
    JWT_SECRET: SECRET,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    APP_ORIGIN: 'http://localhost:5173',
    AUTH_EMAIL_ENABLED: 'false',
  } as unknown as AppEnv['Bindings'];
  return { app, env };
}

test('GET /api/auth/me：未登录 → 401 UNAUTHORIZED', async () => {
  const { app, env } = buildAuthApp();
  const res = await app.request('/api/auth/me', {}, env);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('POST /api/auth/logout：200 且真的下发清 cookie 的 Set-Cookie', async () => {
  const { app, env } = buildAuthApp();
  const res = await app.request('/api/auth/logout', { method: 'POST' }, env);
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /sid=;/);
  assert.match(setCookie, /Max-Age=0/i);
  assert.deepEqual(await res.json(), { ok: true, data: { loggedOut: true } });
});

test('POST /api/auth/email/start：开关关闭 → 501 + code NOT_IMPLEMENTED', async () => {
  const { app, env } = buildAuthApp();
  const res = await app.request(
    '/api/auth/email/start',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.com' }) },
    env,
  );
  assert.equal(res.status, 501);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'NOT_IMPLEMENTED');
});

test('GET /api/auth/github：302 到 github.com 且带 state / redirect_uri', async () => {
  const { app, env } = buildAuthApp();
  const res = await app.request('/api/auth/github', {}, env);
  assert.equal(res.status, 302);
  const location = res.headers.get('location') ?? '';
  assert.ok(location.startsWith('https://github.com/login/oauth/authorize?'));
  const url = new URL(location);
  assert.equal(url.searchParams.get('client_id'), 'test-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost/api/auth/github/callback');
  assert.equal(url.searchParams.get('scope'), 'read:user user:email');
  const state = url.searchParams.get('state') ?? '';
  const payload = await verifyJwt(state, SECRET);
  assert.equal(payload?.purpose, 'state');
});

test('GET /api/auth/github/callback：state 不合法 → 302 到登录错误页', async () => {
  const { app, env } = buildAuthApp();
  const res = await app.request('/api/auth/github/callback?code=abc&state=forged', {}, env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'http://localhost:5173/?login=error&reason=invalid_state');
});

// ── GitHub 回调成功路径（fetch 打桩，不碰真实 GitHub）──────────

interface RecordedCall {
  sql: string;
  args: unknown[];
}

/** 新用户：SELECT users 返回 null，INSERT 记录参数 */
function emptyDb(calls: RecordedCall[]) {
  return {
    prepare(sql: string) {
      const statement = {
        sql,
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return statement;
        },
        first: async () => null,
        all: async () => ({ results: [] as unknown[] }),
        run: async () => ({ success: true }),
      };
      return statement;
    },
  };
}

interface GithubStubOptions {
  tokenStatus?: number;
  email?: string;
}

/** 把全局 fetch 换成 GitHub 桩；返回 restore */
function stubGithubFetch(options: GithubStubOptions = {}): { restore: () => void; calls: string[] } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  const email = options.email ?? 'boss@example.com';

  globalThis.fetch = (async (input: unknown) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : String((input as { url?: string }).url ?? '');
    calls.push(url);

    if (url.includes('github.com/login/oauth/access_token')) {
      if (options.tokenStatus && options.tokenStatus !== 200) {
        return new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: options.tokenStatus });
      }
      return new Response(JSON.stringify({ access_token: 'gho_fake_token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/user/emails')) {
      return new Response(JSON.stringify([{ email, primary: true, verified: true }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/user')) {
      return new Response(
        JSON.stringify({ id: 12345, login: 'wanghu', name: '王虎', avatar_url: 'https://avatars.example.com/u/1', email: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not stubbed', { status: 404 });
  }) as typeof fetch;

  return { restore: () => { globalThis.fetch = original; }, calls };
}

test('GitHub 回调成功：换 token → 拉资料/邮箱 → upsert → 下发 sid（HttpOnly/Secure/Lax/7 天）→ 302', async () => {
  const calls: RecordedCall[] = [];
  const app = new Hono<AppEnv>();
  app.route('/api/auth', authRoute);
  const env = {
    DB: emptyDb(calls),
    JWT_SECRET: SECRET,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    APP_ORIGIN: 'http://localhost:5173',
    ADMIN_EMAILS: 'boss@example.com',
    AUTH_EMAIL_ENABLED: 'false',
  } as unknown as AppEnv['Bindings'];

  const state = await signState(SECRET);
  const stub = stubGithubFetch({ email: 'boss@example.com' });
  let res: Response;
  try {
    res = await app.request(`/api/auth/github/callback?code=good-code&state=${state}`, {}, env);
  } finally {
    stub.restore();
  }

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'http://localhost:5173');

  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /sid=[A-Za-z0-9._-]+/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  assert.match(setCookie, /Max-Age=604800/i);

  // 会话 cookie 里的 JWT 应该能验签并指向刚插入的用户
  const token = /sid=([^;]+)/.exec(setCookie)?.[1] ?? '';
  const payload = await verifyJwt(token, SECRET);
  assert.equal(payload?.purpose, 'session');
  assert.equal(payload?.role, 'admin'); // 命中 ADMIN_EMAILS

  const insert = calls.find((call) => call.sql.includes('INSERT INTO users'));
  assert.ok(insert, '应该插入 users');
  assert.equal(insert.args[4], 'github'); // provider
  assert.equal(insert.args[5], '12345'); // provider_id
  assert.equal(insert.args[1], 'boss@example.com'); // email
  assert.equal(insert.args[6], 'admin'); // role

  // 打桩验证：确实调了 token / user / emails 三个 GitHub 端点
  assert.ok(stub.calls.some((u) => u.includes('login/oauth/access_token')));
  assert.ok(stub.calls.some((u) => u.endsWith('/user')));
  assert.ok(stub.calls.some((u) => u.endsWith('/user/emails')));
});

test('GitHub 回调失败：token 交换失败 → 302 到错误页且不下发 sid', async () => {
  const calls: RecordedCall[] = [];
  const app = new Hono<AppEnv>();
  app.route('/api/auth', authRoute);
  const env = {
    DB: emptyDb(calls),
    JWT_SECRET: SECRET,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    APP_ORIGIN: 'http://localhost:5173',
  } as unknown as AppEnv['Bindings'];

  const state = await signState(SECRET);
  const stub = stubGithubFetch({ tokenStatus: 400 });
  let res: Response;
  try {
    res = await app.request(`/api/auth/github/callback?code=bad-code&state=${state}`, {}, env);
  } finally {
    stub.restore();
  }

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'http://localhost:5173/?login=error&reason=token_exchange');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO users')).length, 0);
});
