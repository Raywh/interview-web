/**
 * 入参校验 schema（zod）
 *
 * 校验口径来自 docs/api.md：
 *  - 投稿：title 1–200；content / analysis 1–20000；category 必须在白名单内
 *  - 评论：content 1–500
 *  - 分页：page ≥ 1；pageSize 1–50，默认 20
 *
 * 分类白名单与小程序版（interview_app/pages/index/index.js）保持一致，
 * 共 13 项；docs/api.md 的 stats 示例（Vue / TypeScript与类型系统）与之一致。
 */
import { z } from 'zod';
import type { ZodError } from 'zod';
import { fail } from './response';

/** 分类白名单（契约：投稿 category 必须命中）
 * 13 项，含 Vue 与 React（2026-11-05 更正：题库两类都要）。
 * 见 docs/api.md §8.1。
 */
export const CATEGORIES = [
  'Vue',
  'React',
  '工程化',
  'CSS',
  'JS',
  'TypeScript与类型系统',
  '流式处理与实时通信',
  '前端状态管理与数据流',
  '性能优化与渲染',
  '前端AI架构设计',
  'AI特性与前端工程实践',
  'AI工程化与前端工具链',
  '大模型前端集成',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TITLE_MAX = 200;
export const BODY_MAX = 20000;
export const COMMENT_MAX = 500;
export const MAX_REVIEW_ROUNDS = 3;

/** 分页（page 从 1 开始，pageSize 默认 20、上限 50） */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'page 必须 ≥ 1').default(1),
  pageSize: z.coerce.number().int().min(1, 'pageSize 必须 ≥ 1').max(50, 'pageSize 上限 50').default(20),
});

/** 题目列表查询：分页 + 可选分类（列表筛选不做白名单限制，精确匹配即可；空串视为不筛选） */
export const questionListQuerySchema = paginationSchema.extend({
  category: z.string().trim().optional(),
  /** 关键词搜索：标题或正文包含（LIKE，通配符已转义） */
  q: z.string().trim().max(100, '搜索词最多 100 字').optional(),
});

/** 投稿 */
export const questionInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(TITLE_MAX, `标题最多 ${TITLE_MAX} 字`),
  content: z.string().trim().min(1, '正文不能为空').max(BODY_MAX, `正文最多 ${BODY_MAX} 字`),
  analysis: z.string().trim().min(1, '解析不能为空').max(BODY_MAX, `解析最多 ${BODY_MAX} 字`),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: '分类不在白名单内' }),
  }),
});

/** 评论 */
export const commentInputSchema = z.object({
  content: z.string().trim().min(1, '评论不能为空').max(COMMENT_MAX, `评论最多 ${COMMENT_MAX} 字`),
});

/** 日志上报（message 由服务端截断，schema 不设上限；meta 任意 JSON） */
export const logInputSchema = z.object({
  level: z.enum(['error', 'warn', 'info'], {
    errorMap: () => ({ message: 'level 必须是 error / warn / info' }),
  }),
  tag: z.string().trim().min(1, 'tag 不能为空').max(100, 'tag 最多 100 字'),
  message: z.string().min(1, 'message 不能为空'),
  meta: z.unknown().optional(),
  path: z.string().max(1000, 'path 最多 1000 字').optional(),
});

/** 审核队列筛选 */
export const adminQueueQuerySchema = z.object({
  type: z.enum(['questions', 'comments'], {
    errorMap: () => ({ message: 'type 必须是 questions / comments' }),
  }).optional(),
  tier: z.enum(['high', 'medium', 'low'], {
    errorMap: () => ({ message: 'tier 必须是 high / medium / low' }),
  }).optional(),
});

/** 审核动作：approve → published；reject → rejected + reason */
export const reviewInputSchema = z
  .object({
    type: z.enum(['question', 'comment'], {
      errorMap: () => ({ message: 'type 必须是 question / comment' }),
    }),
    id: z.string().trim().min(1, 'id 不能为空'),
    action: z.enum(['approve', 'reject'], {
      errorMap: () => ({ message: 'action 必须是 approve / reject' }),
    }),
    reason: z.string().trim().max(500, '原因最多 500 字').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: '拒绝时必须填写原因',
      });
    }
  });

/**
 * 把 zod 校验失败转成契约里的 VALIDATION 响应：
 * message 取第一条错误，reasons 给字段名（去重）。
 */
export function zodFail(error: ZodError): Response {
  const reasons = Array.from(
    new Set(error.issues.map((issue) => issue.path.join('.') || 'body')),
  );
  const message = error.issues[0]?.message ?? '参数校验失败';
  return fail('VALIDATION', message, reasons);
}

/**
 * 下架 / 恢复（管理员对已发布内容）
 * 与 review 区分开：review 只处理 pending，这里处理 published ↔ hidden。
 */
export const visibilityInputSchema = z.object({
  type: z.enum(['question', 'comment'], {
    errorMap: () => ({ message: 'type 必须是 question / comment' }),
  }),
  id: z.string().trim().min(1, 'id 不能为空'),
  hidden: z.boolean({
    errorMap: () => ({ message: 'hidden 必须是布尔值' }),
  }),
});
/** AI 追问（docs/api.md §11） */
export const aiAskSchema = z.object({
  questionId: z.string().trim().min(1, '缺少题目 ID'),
  message: z
    .string()
    .trim()
    .min(1, '请输入问题')
    .max(500, '问题最多 500 字'),
});
/** AI 问答落库（docs/api.md §12） */
export const aiCommentInputSchema = z.object({
  question: z.string().trim().min(1, '缺少提问').max(500, '提问最多 500 字'),
  answer: z.string().trim().min(1, '缺少回答').max(4000, '回答最多 4000 字'),
});
/** AI 解答：给标题，让模型补正文与解析（投稿页用） */
export const aiCompleteSchema = z.object({
  title: z.string().trim().min(5, '标题至少 5 个字').max(200, '标题最多 200 字'),
  category: z.string().trim().max(40).optional(),
});