/**
 * 契约类型（v1，冻结）
 * 规则：只加不改。改字段名 = 破坏契约，必须同步 docs/api.md 并通知全体 agent。
 */

export type Tier = 'high' | 'medium' | 'low';
export type Status = 'published' | 'pending' | 'rejected' | 'hidden';
export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: number;
}

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
  /** 只有作者本人或 admin 能看到；其他情况为 undefined */
  rejectReason?: string | null;
}

/** 列表项：不带 analysis，减少传输量 */
export type QuestionSummary = Omit<Question, 'analysis' | 'content'> & {
  excerpt: string;
};

/** 「我的投稿」列表项：比公开列表多状态与拒绝原因 */
export interface MyQuestionSummary extends QuestionSummary {
  status: Status;
  rejectReason: string | null;
}

/** 「我的评论」列表项：带上所属题目，便于跳转 */
export interface MyComment extends Comment {
  questionTitle: string;
}

export interface Comment {
  id: string;
  questionId: string;
  userId: string;
  userName: string;
  content: string;
  status: Status;
  createdAt: number;
  /** true = 这条是 AI 回答 */
  isAi: boolean;
  /** AI 回答引用的用户提问 */
  quote: string | null;
  /** 门禁判定的风险等级；AI 回答为 high 时前端会提示 */
  riskTier: Tier;
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

/** 门禁判定结果（由 moderation/gate 产出） */
export interface GateResult {
  tier: Tier;
  approvals: number;
  decision: 'auto-publish' | 'needs-human';
  reasons: string[];
  hits: Array<{ id: string; why: string }>;
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'NOT_IMPLEMENTED'
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

/** Worker 绑定（wrangler.toml 必须与此一致） */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Workers AI 绑定（wrangler.toml [ai] binding = "AI"） */
  AI: Ai;
  /** 图片存储（KV；R2 需要绑卡，改用 KV） */
  FILES: KVNamespace;
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  APP_ORIGIN: string;
  ADMIN_EMAILS?: string;
  AUTH_EMAIL_ENABLED?: string;
}

/** 会话载荷 */
export interface SessionPayload {
  sub: string;      // user id
  role: Role;
  iat: number;
  exp: number;
}
