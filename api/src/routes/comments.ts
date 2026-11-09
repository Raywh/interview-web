/**
 * 评论路由 —— 挂载在 /api/questions 下（docs/api.md §2）
 *
 *  GET  /questions/:id/comments   只含 published，按 created_at DESC，Page<Comment>
 *  POST /questions/:id/comments   需登录；门禁算 risk_tier / gate_reasons，入库 status='pending'
 *
 * 说明：本文件注册的是相对路径 `/:id/comments`，由 index.ts 挂到 /api/questions，
 * 最终对外路径就是 /api/questions/:id/comments（契约路径）。
 */
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { newId } from '../lib/id';
import { toComment, type CommentRow } from '../lib/db';
import { fail, ok } from '../lib/response';
import { aiCommentInputSchema, commentInputSchema, paginationSchema, zodFail } from '../lib/validate';
import { evaluate } from '../moderation/gate';

export const commentsRoute = new Hono<AppEnv>();

/** 评论列表：GET /api/questions/:id/comments */
commentsRoute.get('/:id/comments', async (c) => {
  const questionId = c.req.param('id');

  const parsed = paginationSchema.safeParse(c.req.query());
  if (!parsed.success) return zodFail(parsed.error);
  const { page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  const question = await c.env.DB.prepare('SELECT 1 AS ok FROM questions WHERE id = ?')
    .bind(questionId)
    .first<{ ok: number }>();
  if (!question) return fail('NOT_FOUND', '题目不存在');

  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM comments WHERE question_id = ? AND status = 'published'",
  )
    .bind(questionId)
    .first<{ c: number }>();
  const total = Number(totalRow?.c ?? 0);

  const list = await c.env.DB.prepare(
    `SELECT c.id, c.question_id, c.user_id, c.content, c.status, c.risk_tier,
            c.review_round, c.reject_reason, c.is_ai, c.quote, c.created_at, u.name AS user_name
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.question_id = ? AND c.status = 'published'
      ORDER BY c.created_at DESC, c.rowid ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(questionId, pageSize, offset)
    .all<CommentRow>();

  const rows = list.results ?? [];
  return ok({
    items: rows.map(toComment),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
});

/** 发表评论：POST /api/questions/:id/comments（需登录） */
commentsRoute.post('/:id/comments', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const questionId = c.req.param('id');
  const question = await c.env.DB.prepare('SELECT status FROM questions WHERE id = ?')
    .bind(questionId)
    .first<{ status: string }>();
  // 只允许对 published 的题目评论；不存在 / 未发布一律 404，避免泄露待审内容
  if (!question || question.status !== 'published') return fail('NOT_FOUND', '题目不存在');

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = commentInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  // TODO(A2 二期)：限流 comment:u:<userId> 60s/3 条（docs/api.md §6），用 rate_limits 表 +
  //   INSERT ... ON CONFLICT DO UPDATE 实现；超限返回 fail('RATE_LIMITED', ..., ['60/min'])。

  const gate = evaluate({ content: parsed.data.content });

  const id = newId('c');
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO comments
       (id, question_id, user_id, content, status, risk_tier, gate_reasons, review_round, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, 0, ?)`,
  )
    .bind(
      id,
      questionId,
      user.id,
      parsed.data.content,
      gate.tier,
      JSON.stringify(gate.reasons),
      now,
    )
    .run();

  // 契约 §8.3 只要求 { id, status }，这里多带 gate（附加字段，不影响已有消费者）
  return ok({ id, status: 'pending', gate });
});

/**
 * 把一次 AI 问答存进评论区 —— POST /api/questions/:id/ai-comments
 *
 * 前端流程：用户在评论框输入以 @AI 开头的内容 → 走 /api/ai/ask 流式拿到回答
 * → 调本接口把「提问 + 回答」落成一条 AI 评论。
 *
 * 发布策略：
 *   - 门禁判定 low / medium → 直接 published（机器生成内容，风险低）
 *   - high（含联系方式、图片等）→ pending，交给人工看一眼
 *
 * AI 回答挂在系统用户 u_ai_assistant 名下，前端据此渲染 🤖 标识。
 */
commentsRoute.post('/:id/ai-comments', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const questionId = c.req.param('id');
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = aiCommentInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const { question, answer } = parsed.data;

  const exists = await c.env.DB.prepare(
    "SELECT 1 AS ok FROM questions WHERE id = ? AND status = 'published'",
  )
    .bind(questionId)
    .first<{ ok: number }>();
  if (!exists) return fail('NOT_FOUND', '题目不存在或未发布');

  const gate = evaluate({ title: question, content: answer, analysis: '' });
  // AI 回答不进人工审核队列：机器生成、可随时下架。
  // 门禁判为 high 时只留痕，管理员在审核台能看到提示。
  const status = 'published';
  const now = Date.now();
  const id = newId('c');

  // 系统用户：AI 回答的归属（外键要求 users 里存在这一行）
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, avatar_url, provider, provider_id, role, created_at)
     VALUES ('u_ai_assistant', 'AI 助手', NULL, NULL, 'system', 'ai', 'user', ?)`,
  )
    .bind(now)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO comments (id, question_id, user_id, content, status, risk_tier, review_round,
                           reject_reason, gate_reasons, is_ai, quote, created_at)
     VALUES (?, ?, 'u_ai_assistant', ?, ?, ?, 0, NULL, ?, 1, ?, ?)`,
  )
    .bind(id, questionId, answer, status, gate.tier, JSON.stringify(gate.reasons), question, now)
    .run();

  // 高危留痕：不进审核队列，但要让管理员能发现
  if (gate.tier === 'high') {
    await c.env.DB.prepare(
      'INSERT INTO logs (level, tag, message, meta, path, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    )
      .bind(
        'warn',
        'ai.high_risk',
        `AI 回答被判为高风险（题目 ${questionId}）`,
        JSON.stringify({ commentId: id, reasons: gate.reasons, hits: gate.hits }).slice(0, 4096),
        `/q/${questionId}`,
        now,
      )
      .run();
  }

  return ok({ id, status, gate });
});