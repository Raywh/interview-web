/**
 * D1 行 → 契约对象的映射（snake_case → camelCase）
 *
 * 契约类型见 api/src/types.ts（冻结）：
 *  - is_ai    → isAi: boolean
 *  - risk_tier → riskTier: Tier
 *  - created_at → createdAt: number（epoch 毫秒）
 */
import type { Comment, Question, QuestionSummary, Status, Tier } from '../types';

/** excerpt 长度（docs/api.md：取 content 前 120 字） */
export const EXCERPT_LENGTH = 120;

/** questions 表整行 */
export interface QuestionRow {
  id: string;
  title: string;
  content: string;
  analysis: string;
  category: string;
  author_id: string | null;
  is_ai: number;
  status: string;
  risk_tier: string;
  review_round: number;
  reject_reason: string | null;
  views: number;
  created_at: number;
  updated_at: number;
}

/** 列表查询只取摘要所需列 */
export type QuestionSummaryRow = Pick<
  QuestionRow,
  'id' | 'title' | 'content' | 'category' | 'is_ai' | 'status' | 'risk_tier' | 'author_id' | 'created_at'
>;

/** comments 表整行（user_name 来自 LEFT JOIN users） */
export interface CommentRow {
  id: string;
  question_id: string;
  user_id: string;
  content: string;
  status: string;
  risk_tier: string;
  review_round: number;
  reject_reason: string | null;
  is_ai?: number;
  quote?: string | null;
  created_at: number;
  user_name?: string | null;
}

const TIERS: readonly Tier[] = ['high', 'medium', 'low'];
const STATUSES: readonly Status[] = ['published', 'pending', 'rejected', 'hidden'];

/** 未知 / 脏数据一律降级，避免一条坏行把整个列表打挂 */
export function toTier(value: string): Tier {
  return TIERS.includes(value as Tier) ? (value as Tier) : 'low';
}

export function toStatus(value: string): Status {
  return STATUSES.includes(value as Status) ? (value as Status) : 'pending';
}

/** D1 的 INTEGER 0/1（或未来 boolean）→ boolean */
export function toBoolean(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true;
}

/** 按「字」（code point）截断，避免把 emoji 切成半个 */
export function excerpt(content: string, max: number = EXCERPT_LENGTH): string {
  const chars = Array.from(content);
  return chars.length > max ? chars.slice(0, max).join('') : content;
}

/**
 * @param includeRejectReason 只有作者本人 / admin 查看时传 true；
 *        其他人拿到的对象里**没有这个字段**（docs/api.md §9）
 */
export function toQuestion(row: QuestionRow, includeRejectReason = false): Question {
  const question: Question = {
    id: row.id,
    title: row.title,
    content: row.content,
    analysis: row.analysis,
    category: row.category,
    isAi: toBoolean(row.is_ai),
    status: toStatus(row.status),
    riskTier: toTier(row.risk_tier),
    authorId: row.author_id,
    createdAt: row.created_at,
  };
  if (includeRejectReason) question.rejectReason = row.reject_reason;
  return question;
}

export function toQuestionSummary(row: QuestionSummaryRow): QuestionSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.content),
    category: row.category,
    isAi: toBoolean(row.is_ai),
    status: toStatus(row.status),
    riskTier: toTier(row.risk_tier),
    authorId: row.author_id,
    createdAt: row.created_at,
  };
}

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    questionId: row.question_id,
    userId: row.user_id,
    userName: row.user_name ?? '',
    content: row.content,
    status: toStatus(row.status),
    createdAt: row.created_at,
    isAi: toBoolean(row.is_ai ?? 0),
    quote: row.quote ?? null,
    riskTier: toTier(row.risk_tier),
  };
}
