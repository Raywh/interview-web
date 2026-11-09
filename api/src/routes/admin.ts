/**
 * 管理端路由 —— 挂载在 /api/admin（docs/api.md §3）
 *
 *  GET  /queue   待审队列：type=questions|comments、tier=high|medium|low
 *                排序：risk_tier（high > medium > low）→ created_at ASC
 *  POST /review  approve → published；reject → rejected + reject_reason，review_round += 1
 *  GET  /stats   队列长度、今日通过 / 拒绝数、ai.neurons 恒 0
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { requireAdmin } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { toTier } from '../lib/db';
import { fail, ok } from '../lib/response';
import {
  adminQueueQuerySchema,
  MAX_REVIEW_ROUNDS,
  reviewInputSchema,
  visibilityInputSchema,
  zodFail,
} from '../lib/validate';
import type { Tier } from '../types';

export const adminRoute = new Hono<AppEnv>();
/** gate_reasons 是 JSON 数组字符串；坏数据一律当空数组，审核台不能因为脏数据挂掉 */
function parseReasons(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 审核台条目（docs/api.md §3 的 data.items 形状） */
interface QueueItem {
  id: string;
  kind: 'question' | 'comment';
  title: string;
  content: string;
  category: string;
  riskTier: Tier;
  gateReasons: string[];
  authorName: string;
  createdAt: number;
}

interface QuestionQueueRow {
  id: string;
  title: string;
  content: string;
  category: string;
  risk_tier: string;
  gate_reasons: string | null;
  created_at: number;
  author_name: string | null;
}

interface CommentQueueRow {
  id: string;
  content: string;
  risk_tier: string;
  gate_reasons: string | null;
  created_at: number;
  author_name: string | null;
  question_title: string | null;
  question_category: string | null;
}

interface ReviewRow {
  id: string;
  status: string;
  review_round: number;
}

/** 鉴权兜底：requireAdmin 已保证 admin，这里再取一次用户给后续逻辑用 */
function guardAdmin(c: Context<AppEnv>): Response | null {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');
  if (user.role !== 'admin') return fail('FORBIDDEN', '需要管理员权限');
  return null;
}

/** 待审队列：GET /api/admin/queue */
adminRoute.get('/queue', requireAdmin, async (c) => {
  const denied = guardAdmin(c);
  if (denied) return denied;

  const parsed = adminQueueQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return zodFail(parsed.error);
  const { type, tier } = parsed.data;

  const items: QueueItem[] = [];

  // 说明：分类/等级过滤用固定 SQL 分支（不拼接任何用户输入），排序按 high→medium→low 再时间升序
  const wantQuestions = type === undefined || type === 'questions';
  const wantComments = type === undefined || type === 'comments';

  if (wantQuestions) {
    const sql = tier
      ? `SELECT q.id, q.title, q.content, q.category, q.risk_tier, q.gate_reasons, q.created_at, u.name AS author_name
           FROM questions q
           LEFT JOIN users u ON u.id = q.author_id
          WHERE q.status = 'pending' AND q.risk_tier = ?
          ORDER BY CASE q.risk_tier WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                   q.created_at ASC`
      : `SELECT q.id, q.title, q.content, q.category, q.risk_tier, q.gate_reasons, q.created_at, u.name AS author_name
           FROM questions q
           LEFT JOIN users u ON u.id = q.author_id
          WHERE q.status = 'pending'
          ORDER BY CASE q.risk_tier WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                   q.created_at ASC`;

    const stmt = c.env.DB.prepare(sql);
    const result = tier
      ? await stmt.bind(tier).all<QuestionQueueRow>()
      : await stmt.all<QuestionQueueRow>();

    for (const row of result.results ?? []) {
      items.push({
        id: row.id,
        kind: 'question',
        title: row.title,
        content: row.content,
        category: row.category,
        riskTier: toTier(row.risk_tier),
        gateReasons: parseReasons(row.gate_reasons),
        authorName: row.author_name ?? '匿名',
        createdAt: row.created_at,
      });
    }
  }

  if (wantComments) {
    const sql = tier
      ? `SELECT c.id, c.content, c.risk_tier, c.gate_reasons, c.created_at, u.name AS author_name,
                q.title AS question_title, q.category AS question_category
           FROM comments c
           LEFT JOIN users u ON u.id = c.user_id
           LEFT JOIN questions q ON q.id = c.question_id
          WHERE c.status = 'pending' AND c.risk_tier = ?
          ORDER BY CASE c.risk_tier WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                   c.created_at ASC`
      : `SELECT c.id, c.content, c.risk_tier, c.gate_reasons, c.created_at, u.name AS author_name,
                q.title AS question_title, q.category AS question_category
           FROM comments c
           LEFT JOIN users u ON u.id = c.user_id
           LEFT JOIN questions q ON q.id = c.question_id
          WHERE c.status = 'pending'
          ORDER BY CASE c.risk_tier WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                   c.created_at ASC`;

    const stmt = c.env.DB.prepare(sql);
    const result = tier
      ? await stmt.bind(tier).all<CommentQueueRow>()
      : await stmt.all<CommentQueueRow>();

    for (const row of result.results ?? []) {
      items.push({
        id: row.id,
        kind: 'comment',
        // 评论本身没有标题/分类，借用所属题目的（契约 items[].title / category 是必填形状）
        title: row.question_title ?? '评论',
        content: row.content,
        category: row.question_category ?? '',
        riskTier: toTier(row.risk_tier),
        gateReasons: parseReasons(row.gate_reasons),
        authorName: row.author_name ?? '匿名',
        createdAt: row.created_at,
      });
    }
  }

  return ok({ items, total: items.length });
});

/** 审核：POST /api/admin/review */
adminRoute.post('/review', requireAdmin, async (c) => {
  const denied = guardAdmin(c);
  if (denied) return denied;

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = reviewInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const { type, id, action, reason } = parsed.data;

  const isQuestion = type === 'question';
  const row = isQuestion
    ? await c.env.DB.prepare('SELECT id, status, review_round FROM questions WHERE id = ?')
        .bind(id)
        .first<ReviewRow>()
    : await c.env.DB.prepare('SELECT id, status, review_round FROM comments WHERE id = ?')
        .bind(id)
        .first<ReviewRow>();

  if (!row) return fail('NOT_FOUND', '条目不存在');
  if (row.status !== 'pending') return fail('CONFLICT', '该条目已审核，请勿重复审核');
  // docs/api.md §3：review_round > 3 时拒绝提交（24h 冷却）
  if (row.review_round > MAX_REVIEW_ROUNDS) {
    return fail('CONFLICT', `该条目已达审核轮次上限（${MAX_REVIEW_ROUNDS} 轮），请等待 24 小时冷却`);
  }

  const now = Date.now();
  const nextStatus = action === 'approve' ? 'published' : 'rejected';

  if (action === 'approve') {
    if (isQuestion) {
      await c.env.DB.prepare(
        "UPDATE questions SET status = 'published', reject_reason = NULL, updated_at = ? WHERE id = ?",
      )
        .bind(now, id)
        .run();
    } else {
      await c.env.DB.prepare(
        "UPDATE comments SET status = 'published', reject_reason = NULL WHERE id = ?",
      )
        .bind(id)
        .run();
    }
  } else if (isQuestion) {
    await c.env.DB.prepare(
      `UPDATE questions
          SET status = 'rejected', reject_reason = ?, review_round = review_round + 1, updated_at = ?
        WHERE id = ?`,
    )
      .bind(reason ?? null, now, id)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE comments
          SET status = 'rejected', reject_reason = ?, review_round = review_round + 1
        WHERE id = ?`,
    )
      .bind(reason ?? null, id)
      .run();
  }

  return ok({ id, type, status: nextStatus });
});

/** 管理端统计：GET /api/admin/stats */
adminRoute.get('/stats', requireAdmin, async (c) => {
  const denied = guardAdmin(c);
  if (denied) return denied;

  const db = c.env.DB;
  // 今日 = UTC 当日 0 点起（Workers 运行时无本地时区配置；如需北京时间要再 +8，待确认）
  const now = Date.now();
  const dayStart = now - (now % (24 * 60 * 60 * 1000));

  const [pendingQuestions, pendingComments, publishedQuestions, publishedComments, rejectedQuestions, rejectedComments, flagged] =
    await Promise.all([
      db.prepare("SELECT COUNT(*) AS c FROM questions WHERE status = 'pending'").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM comments WHERE status = 'pending'").first<{ c: number }>(),
      // 门禁判为 high 的 AI 回答：不进审核队列，但要让人看得见
      db.prepare("SELECT COUNT(*) AS c FROM comments WHERE is_ai = 1 AND risk_tier = 'high' AND status = 'published'").first<{ c: number }>(),
      // questions 有 updated_at，按审核动作时间统计
      db.prepare("SELECT COUNT(*) AS c FROM questions WHERE status = 'published' AND updated_at >= ?")
        .bind(dayStart)
        .first<{ c: number }>(),
      // comments 表没有 updated_at（schema 限制），只能用 created_at 近似
      db.prepare("SELECT COUNT(*) AS c FROM comments WHERE status = 'published' AND created_at >= ?")
        .bind(dayStart)
        .first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM questions WHERE status = 'rejected' AND updated_at >= ?")
        .bind(dayStart)
        .first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM comments WHERE status = 'rejected' AND created_at >= ?")
        .bind(dayStart)
        .first<{ c: number }>(),
    ]);

  return ok({
    queue: {
      questions: Number(pendingQuestions?.c ?? 0),
      comments: Number(pendingComments?.c ?? 0),
    },
    today: {
      published: Number(publishedQuestions?.c ?? 0) + Number(publishedComments?.c ?? 0),
      rejected: Number(rejectedQuestions?.c ?? 0) + Number(rejectedComments?.c ?? 0),
    },
    // 二期接入 AI 能力后才有值，当前恒为 0（docs/api.md §3）
    ai: { neurons: 0 },
    // 门禁判为 high 的 AI 回答数：不进审核队列，靠这个数字提醒管理员
    flagged: Number(flagged?.c ?? 0),
  });
});

/**
 * 下架 / 恢复 —— POST /api/admin/visibility
 *
 * 已发布内容发现问题时的兜底操作（个人主体做 UGC 必须有这个能力）。
 * 与 review 分开：review 只处理 pending，不碰已发布的。
 */
adminRoute.post('/visibility', requireAdmin, async (c) => {
  const denied = guardAdmin(c);
  if (denied) return denied;

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = visibilityInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const { type, id, hidden } = parsed.data;
  const isQuestion = type === 'question';
  const table = isQuestion ? 'questions' : 'comments';

  const row = await c.env.DB.prepare(`SELECT id, status FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!row) return fail('NOT_FOUND', '条目不存在');

  const next = hidden ? 'hidden' : 'published';
  if (row.status === next) {
    return ok({ id, type, status: next });
  }

  const now = Date.now();
  if (isQuestion) {
    await c.env.DB.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?')
      .bind(next, now, id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(next, id).run();
  }

  return ok({ id, type, status: next });
});