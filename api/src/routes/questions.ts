/**
 * 题目路由 —— 挂载在 /api/questions（docs/api.md §2）
 *
 *  GET  /            列表：只 published，按 created_at DESC，excerpt 取正文前 120 字
 *  GET  /:id         详情：published 任何人可读并 views+1；pending/rejected 仅作者或 admin；
 *                    hidden 仅 admin
 *  POST /            投稿（需登录）：先过门禁 evaluate()，risk_tier / gate_reasons 真实落库
 */
import { Hono } from 'hono';
import { optionalAuth, requireAuth } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { newId } from '../lib/id';
import {
  toQuestion,
  toQuestionSummary,
  type QuestionRow,
  type QuestionSummaryRow,
} from '../lib/db';
import { fail, ok } from '../lib/response';
import { questionInputSchema, questionListQuerySchema, zodFail } from '../lib/validate';
import { evaluate } from '../moderation/gate';

export const questionsRoute = new Hono<AppEnv>();

// 公开读接口也要能识别登录态（GET /:id 的 pending/rejected/hidden 分支），
// 所以先挂一个不拦截的 optionalAuth；POST 再单独用 requireAuth 卡住游客。
questionsRoute.use('*', optionalAuth);

/** 列表：GET /api/questions?category=&page=&pageSize= */
questionsRoute.get('/', async (c) => {
  const parsed = questionListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return zodFail(parsed.error);

  const { page, pageSize, category, q } = parsed.data;
  const offset = (page - 1) * pageSize;
  const db = c.env.DB;

  // 动态拼 WHERE，但只拼「固定片段」，值一律参数绑定
  const where: string[] = ["status = 'published'"];
  const bind: unknown[] = [];

  if (category) {
    where.push('category = ?');
    bind.push(category);
  }

  if (q) {
    // LIKE 通配符转义：用户输入的 % _ \ 都当字面量
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const like = `%${escaped}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
    bind.push(like, like);
  }

  const whereSql = where.join(' AND ');

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM questions WHERE ${whereSql}`)
    .bind(...bind)
    .first<{ c: number }>();
  const total = Number(totalRow?.c ?? 0);

  const list = await db
    .prepare(
      `SELECT id, title, content, category, is_ai, status, risk_tier, author_id, created_at
         FROM questions
        WHERE ${whereSql}
        ORDER BY created_at DESC, rowid ASC
        LIMIT ? OFFSET ?`,
    )
    .bind(...bind, pageSize, offset)
    .all<QuestionSummaryRow>();
  const rows: QuestionSummaryRow[] = [...(list.results ?? [])];

  return ok({
    items: rows.map(toQuestionSummary),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
});

/** 详情：GET /api/questions/:id */
questionsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?')
    .bind(id)
    .first<QuestionRow>();

  if (!row) return fail('NOT_FOUND', '题目不存在');

  const user = currentUser(c);
  const status = row.status;

  if (status === 'published') {
    // 读一次详情 views+1（不返回 views 字段，契约 Question 里没有）
    await c.env.DB.prepare('UPDATE questions SET views = views + 1 WHERE id = ?').bind(id).run();
    return ok(toQuestion(row));
  }

  if (status === 'pending' || status === 'rejected') {
    if (!user) return fail('UNAUTHORIZED', '请先登录');
    if (user.id !== row.author_id && user.role !== 'admin') {
      return fail('FORBIDDEN', '无权查看该题目');
    }
    // 作者 / admin 能拿到拒绝原因（docs/api.md §9）
    return ok(toQuestion(row, true));
  }

  if (status === 'hidden') {
    if (!user) return fail('UNAUTHORIZED', '请先登录');
    if (user.role !== 'admin') return fail('FORBIDDEN', '无权查看该题目');
    return ok(toQuestion(row, true));
  }

  return fail('NOT_FOUND', '题目不存在');
});

/** 投稿：POST /api/questions（需登录） */
questionsRoute.post('/', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = questionInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  // TODO(A2 二期 / A3)：限流 question:u:<userId> 1h/10 次（docs/api.md §6），rate_limits 表实现

  const { title, content, analysis, category } = parsed.data;
  const now = Date.now();
  const id = newId('q');

  // 门禁：档位 / 批准人数 / 是否自动发布全部来自 moderation.config.json
  const gate = evaluate({ title, content, analysis });
  const status = gate.decision === 'auto-publish' ? 'published' : 'pending';

  await c.env.DB.prepare(
    `INSERT INTO questions
       (id, title, content, analysis, category, author_id, is_ai, status, risk_tier, gate_reasons, review_round, views, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?)`,
  )
    .bind(
      id,
      title,
      content,
      analysis,
      category,
      user.id,
      status,
      gate.tier,
      JSON.stringify(gate.reasons),
      now,
      now,
    )
    .run();

  return ok({ id, status, gate });
});
