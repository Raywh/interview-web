/**
 * 个人中心 —— 挂载在 /api/me（docs/api.md §9）
 *
 *  GET /api/me/questions  本人的投稿，**不受 status 限制**（待审/已拒绝也要能看到）
 *  GET /api/me/comments   本人的评论，附带所属题目标题
 *
 * 与公开列表的区别只有两点：只返回本人数据、状态不过滤。
 */
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { excerpt, toBoolean, toStatus, toTier } from '../lib/db';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { fail, ok } from '../lib/response';
import { paginationSchema, zodFail } from '../lib/validate';
import type { MyComment, MyQuestionSummary } from '../types';

export const meRoute = new Hono<AppEnv>();

interface MyQuestionRow {
  id: string;
  title: string;
  content: string;
  category: string;
  is_ai: number;
  status: string;
  risk_tier: string;
  author_id: string | null;
  created_at: number;
  reject_reason: string | null;
}

interface MyCommentRow {
  id: string;
  question_id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: number;
  user_name: string | null;
  question_title: string | null;
  is_ai: number;
  quote: string | null;
  risk_tier: string;
}

/** 我的投稿 */
meRoute.get('/questions', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const parsed = paginationSchema.safeParse(c.req.query());
  if (!parsed.success) return zodFail(parsed.error);
  const { page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM questions WHERE author_id = ?')
    .bind(user.id)
    .first<{ n: number }>();
  const total = countRow?.n ?? 0;

  const result = await c.env.DB.prepare(
    `SELECT id, title, content, category, is_ai, status, risk_tier, author_id, created_at, reject_reason
       FROM questions
      WHERE author_id = ?
      ORDER BY created_at DESC, rowid ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(user.id, pageSize, offset)
    .all<MyQuestionRow>();

  const items: MyQuestionSummary[] = (result.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.content),
    category: row.category,
    isAi: toBoolean(row.is_ai),
    status: toStatus(row.status),
    riskTier: toTier(row.risk_tier),
    authorId: row.author_id,
    createdAt: row.created_at,
    rejectReason: row.reject_reason ?? null,
  }));

  return ok({ items, total, page, pageSize, hasMore: offset + items.length < total });
});

/** 我的评论 */
meRoute.get('/comments', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const parsed = paginationSchema.safeParse(c.req.query());
  if (!parsed.success) return zodFail(parsed.error);
  const { page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?')
    .bind(user.id)
    .first<{ n: number }>();
  const total = countRow?.n ?? 0;

  const result = await c.env.DB.prepare(
    `SELECT c.id, c.question_id, c.user_id, c.content, c.status, c.created_at,
            c.is_ai, c.quote, c.risk_tier, u.name AS user_name, q.title AS question_title
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN questions q ON q.id = c.question_id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC, c.rowid ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(user.id, pageSize, offset)
    .all<MyCommentRow>();

  const items: MyComment[] = (result.results ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    userId: row.user_id,
    userName: row.user_name ?? '',
    content: row.content,
    status: toStatus(row.status),
    createdAt: row.created_at,
    isAi: toBoolean(row.is_ai),
    quote: row.quote ?? null,
    riskTier: toTier(row.risk_tier),
    questionTitle: row.question_title ?? '（题目已删除）',
  }));

  return ok({ items, total, page, pageSize, hasMore: offset + items.length < total });
});
