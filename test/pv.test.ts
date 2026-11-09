/**
 * 访问统计测试（零依赖，node:test + node:sqlite）
 *
 * 运行：node --test test/pv.test.ts
 *
 * 用真实的 SQLite（Node 24 内置 node:sqlite）当假 D1，真跑 POST /api/pv：
 *   - 合法路径计数 +1（query / hash 被去掉，/q/<id> 保持原样）
 *   - 白名单外路径归到 /other
 *   - 连续上报按 (day, path) 累加，只占一行
 *   - 同一 IP 每分钟 30 次上限，超限 counted:false 且不再计数
 *
 * 说明：node:sqlite 与 Cloudflare D1 都是 SQLite 语义，UPSERT 行为可信；
 * 但 D1 的网络/绑定层不在测试范围。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';

import type { AppEnv } from '../api/src/lib/env.ts';

// API 源码用无扩展名相对导入，Node 直跑需要这条回退钩子（见 test/ts-resolve.mjs）
register(new URL('./ts-resolve.mjs', import.meta.url));
const { pvRoute, normalizePath, PV_PATH_MAX } = await import('../api/src/routes/pv.ts');

const SECRET = 'test-secret-0123456789';
const IP = '203.0.113.7';

/** 建一个最小的本地 SQLite：pageviews + rate_limits */
function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE pageviews (
      day   TEXT NOT NULL,
      path  TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, path)
    );
    CREATE TABLE rate_limits (
      key       TEXT PRIMARY KEY,
      count     INTEGER NOT NULL DEFAULT 0,
      expire_at INTEGER NOT NULL
    );
  `);
  return db;
}

interface Stmt {
  bind: (...args: unknown[]) => Stmt;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: true }>;
}

/** 把 node:sqlite 包成路由用到的 D1 子集（prepare/bind/first/all/run） */
function asD1(db: DatabaseSync): unknown {
  function makeStmt(sql: string, args: unknown[]): Stmt {
    return {
      bind: (...next: unknown[]) => makeStmt(sql, next),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => {
        db.prepare(sql).run(...args);
        return { success: true as const };
      },
    };
  }
  return { prepare: (sql: string) => makeStmt(sql, []) };
}

function makeApp(db: DatabaseSync) {
  const app = new Hono<AppEnv>();
  app.route('/api/pv', pvRoute);
  const env = { DB: asD1(db), JWT_SECRET: SECRET } as unknown as AppEnv['Bindings'];
  return { app, env };
}

async function post(
  app: Hono<AppEnv>,
  env: AppEnv['Bindings'],
  body: unknown,
  ip = IP,
): Promise<Response> {
  return app.request(
    '/api/pv',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    },
    env,
  );
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

test('normalizePath：去 query/hash、超长截断、白名单外归 /other', () => {
  assert.equal(normalizePath('/q/q_01H?from=home#comments'), '/q/q_01H');
  assert.equal(normalizePath('/admin'), '/admin');
  assert.equal(normalizePath('/admin/queue'), '/admin/queue');
  assert.equal(normalizePath('/login?next=/admin'), '/login');
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/unknown/thing'), '/other');
  assert.equal(normalizePath('https://evil.example/x'), '/other');
  assert.equal(normalizePath('not-a-path'), '/other');
  assert.equal(normalizePath(undefined), '/other');
  assert.equal(normalizePath({ path: '/' }), '/other');

  const longQ = `/q/${'x'.repeat(200)}`;
  const normalized = normalizePath(longQ);
  assert.equal(normalized.length, PV_PATH_MAX);
  assert.ok(normalized.startsWith('/q/'));
});

test('POST /api/pv：合法路径计数 +1，query/hash 被去掉', async () => {
  const db = makeDb();
  const { app, env } = makeApp(db);

  const res = await post(app, env, { path: '/q/q_01H?from=home#comments' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, data: { counted: true } });

  const row = db.prepare('SELECT day, path, count FROM pageviews').get() as {
    day: string;
    path: string;
    count: number;
  };
  assert.equal(row.day, utcToday());
  assert.equal(row.path, '/q/q_01H');
  assert.equal(Number(row.count), 1);
});

test('POST /api/pv：连续上报同一路径 → 累加为 2，只占一行', async () => {
  const db = makeDb();
  const { app, env } = makeApp(db);

  await post(app, env, { path: '/q/q_01H' });
  const second = await post(app, env, { path: '/q/q_01H' });
  assert.deepEqual(await second.json(), { ok: true, data: { counted: true } });

  const row = db.prepare('SELECT count FROM pageviews').get() as { count: number };
  assert.equal(Number(row.count), 2);

  const total = db.prepare('SELECT COUNT(*) AS n FROM pageviews').get() as { n: number };
  assert.equal(Number(total.n), 1, '(day, path) 相同应合并成一行');
});

test('POST /api/pv：白名单外路径 / 缺 path 都归到 /other', async () => {
  const db = makeDb();
  const { app, env } = makeApp(db);

  await post(app, env, { path: '/secret/backdoor' });
  await post(app, env, { path: 'https://evil.example/x' });
  await post(app, env, {});

  const rows = db.prepare('SELECT path, count FROM pageviews ORDER BY path').all() as Array<{
    path: string;
    count: number;
  }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.path, '/other');
  assert.equal(Number(rows[0]?.count), 3);
});

test('POST /api/pv：同一 IP 每分钟 30 次上限，超限 counted:false 且不再计数', async () => {
  const db = makeDb();
  const { app, env } = makeApp(db);

  for (let i = 0; i < 30; i += 1) {
    const res = await post(app, env, { path: '/' });
    assert.deepEqual(await res.json(), { ok: true, data: { counted: true } });
  }

  const limited = await post(app, env, { path: '/' });
  assert.equal(limited.status, 200);
  assert.deepEqual(await limited.json(), { ok: true, data: { counted: false } });

  const row = db.prepare('SELECT count FROM pageviews WHERE path = ?').get('/') as {
    count: number;
  };
  assert.equal(Number(row.count), 30, '超限请求不应继续累加');
});
