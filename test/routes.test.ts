/**
 * 门禁接入测试（零依赖，node:test）
 *
 * 运行：node --test test/routes.test.ts
 *
 * 用 Hono + 假 D1 真跑 POST /api/questions 与 POST /api/questions/:id/comments：
 *   - 门禁算出的 risk_tier / gate_reasons 是否真的写进 INSERT 参数
 *   - 响应里的 gate 是不是真实结果（不是占位）
 *   - 未登录投稿是否被 requireAuth 挡住
 *
 * 说明：假 D1 只记录 prepare().bind() 的参数，不执行 SQL；真实 D1 行为不在测试范围。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Hono } from 'hono';

import type { AppEnv } from '../api/src/lib/env.ts';
import { signSession } from '../api/src/auth/jwt.ts';

// API 源码用无扩展名相对导入，Node 直跑需要这条回退钩子（见 test/ts-resolve.mjs）
register(new URL('./ts-resolve.mjs', import.meta.url));
const { questionsRoute } = await import('../api/src/routes/questions.ts');
const { commentsRoute } = await import('../api/src/routes/comments.ts');

const SECRET = 'test-secret-0123456789';
const USER_ID = 'u_TESTUSER';

interface SqlCall {
  sql: string;
  args: unknown[];
}

const userRow = {
  id: USER_ID,
  name: '测试用户',
  email: null,
  avatar_url: null,
  role: 'user',
  created_at: 1,
  // 评论路由会 SELECT status FROM questions，同一份假数据带上
  status: 'published',
};

/** 假 D1：记录每次 bind 的 (sql, args)，first() 恒返回给定行 */
function recordingDb(row: Record<string, unknown>, calls: SqlCall[]) {
  return {
    prepare(sql: string) {
      const statement = {
        sql,
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return statement;
        },
        first: async () => row,
        all: async () => ({ results: [] as unknown[] }),
        run: async () => ({ success: true }),
      };
      return statement;
    },
  };
}

function makeApp(calls: SqlCall[]) {
  const app = new Hono<AppEnv>();
  app.route('/api/questions', questionsRoute);
  app.route('/api/questions', commentsRoute);
  const env = {
    DB: recordingDb(userRow, calls),
    JWT_SECRET: SECRET,
  } as unknown as AppEnv['Bindings'];
  return { app, env };
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ id: USER_ID, role: 'user' }, SECRET);
  return `sid=${token}`;
}

test('POST /api/questions：手机号内容 → 入库 risk_tier=high + gate_reasons，响应 gate 为真实结果', async () => {
  const calls: SqlCall[] = [];
  const { app, env } = makeApp(calls);
  const res = await app.request(
    '/api/questions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await sessionCookie() },
      body: JSON.stringify({
        title: '如何理解 ref 和 reactive',
        content: '面试官问我 13812345678 这个号码相关的问题',
        analysis: '解析内容',
        category: 'Vue',
      }),
    },
    env,
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { id: string; status: string; gate: { tier: string; approvals: number; decision: string; reasons: string[] } };
  };
  assert.equal(body.data.status, 'pending');
  assert.equal(body.data.gate.tier, 'high');
  assert.equal(body.data.gate.approvals, 2);
  assert.equal(body.data.gate.decision, 'needs-human');
  assert.ok(body.data.gate.reasons.includes('疑似手机号'));

  const insert = calls.find((call) => call.sql.includes('INSERT INTO questions'));
  assert.ok(insert, '应该有 INSERT INTO questions');
  // 参数顺序：(id, title, content, analysis, category, author_id, status, risk_tier, gate_reasons, created_at, updated_at)
  assert.equal(insert.args[6], 'pending');
  assert.equal(insert.args[7], 'high');
  const storedReasons = JSON.parse(String(insert.args[8])) as string[];
  assert.ok(Array.isArray(storedReasons));
  assert.ok(storedReasons.includes('疑似手机号'));
});

test('POST /api/questions：带链接 → 入库 risk_tier=medium（extlink raise）', async () => {
  const calls: SqlCall[] = [];
  const { app, env } = makeApp(calls);
  const res = await app.request(
    '/api/questions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await sessionCookie() },
      body: JSON.stringify({
        title: '参考文档',
        content: '可以看 https://vuejs.org/guide 这里的说明',
        analysis: '解析内容',
        category: 'Vue',
      }),
    },
    env,
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { gate: { tier: string; approvals: number } } };
  assert.equal(body.data.gate.tier, 'medium');
  assert.equal(body.data.gate.approvals, 1);

  const insert = calls.find((call) => call.sql.includes('INSERT INTO questions'));
  assert.equal(insert?.args[7], 'medium');
});

test('POST /api/questions：未登录 → 401（requireAuth 真拦截，stub 已删）', async () => {
  const calls: SqlCall[] = [];
  const { app, env } = makeApp(calls);
  const res = await app.request(
    '/api/questions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 't', content: 'c', analysis: 'a', category: 'Vue' }),
    },
    env,
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO questions')).length, 0);
});

test('POST /api/questions/:id/comments：评论门禁结果同样落库', async () => {
  const calls: SqlCall[] = [];
  const { app, env } = makeApp(calls);
  const res = await app.request(
    '/api/questions/q_TEST/comments',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await sessionCookie() },
      body: JSON.stringify({ content: '详见 https://example.com/answer 的解释' }),
    },
    env,
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { status: string; gate: { tier: string; approvals: number; reasons: string[] } };
  };
  assert.equal(body.data.status, 'pending');
  assert.equal(body.data.gate.tier, 'medium');
  assert.equal(body.data.gate.approvals, 1);
  assert.ok(body.data.gate.reasons.includes('含外链'));

  const insert = calls.find((call) => call.sql.includes('INSERT INTO comments'));
  assert.ok(insert, '应该有 INSERT INTO comments');
  // 参数顺序：(id, question_id, user_id, content, risk_tier, gate_reasons, created_at)
  assert.equal(insert.args[4], 'medium');
  const storedReasons = JSON.parse(String(insert.args[5])) as string[];
  assert.ok(storedReasons.includes('含外链'));
});
