/**
 * API 契约类型（与 api/src/types.ts、docs/api.md 对齐；只声明 A4 用到的部分）。
 */

export type Tier = 'high' | 'medium' | 'low';
export type Status = 'published' | 'pending' | 'rejected' | 'hidden';

/** 列表项：不带 content / analysis，用 excerpt 代替（docs/api.md §2） */
export interface QuestionSummary {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  isAi: boolean;
  status: Status;
  riskTier: Tier;
  authorId: string | null;
  createdAt: number;
}

/** 详情：docs/api.md §2 GET /api/questions/:id */
export interface Question {
  id: string;
  title: string;
  content: string;
  analysis: string;
  category: string;
  isAi: boolean;
  status: Status;
  riskTier: Tier;
  authorId: string | null;
  createdAt: number;
  /** 仅作者本人 / admin 可见（docs/api.md §9）；其他人响应里没有该字段 */
  rejectReason?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Stats {
  total: number;
  categories: Array<{ name: string; count: number }>;
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL';

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    reasons?: string[];
  };
};
export type ApiResponse<T> = ApiOk<T> | ApiErr;

/** 「我的投稿」列表项（docs/api.md §9）：比公开列表多状态与拒绝原因 */
export interface MyQuestionSummary extends QuestionSummary {
  rejectReason: string | null;
}

/** 「我的评论」列表项（docs/api.md §9）：带所属题目，便于跳转 */
export interface MyComment {
  id: string;
  questionId: string;
  userId: string;
  userName: string;
  content: string;
  status: Status;
  createdAt: number;
  questionTitle: string;
}