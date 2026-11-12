/**
 * A5 端点封装：认证 / 投稿 / 审核台。
 *
 * 为什么单独一个文件：`api/client.ts`（A4 交付）只导出 3 个只读接口，内部的 request()
 * 没有导出，而本轮约束不允许修改 `web/src/api/**` 的既有文件。为了守住「请求只出现在
 * api 层、视图里不写 fetch」，这里按 docs/api.md §0 的同一套 `{ ok, data }` 包裹补一层
 * request，错误类型继续复用 client.ts 的 ApiError（调用方的 catch 逻辑完全一致）。
 *
 * 契约来源：docs/api.md §1 认证 / §2 题目 / §3 管理。
 */
import { ApiError } from './client';
import type { ApiResponse, MyComment, MyQuestionSummary, Page, Status, Tier } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    // 同源部署 + cookie 会话（docs/api.md §0：必须 credentials: 'include'）
    res = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('NETWORK', '无法连接服务器，请检查网络后重试');
  }

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (!payload || typeof payload.ok !== 'boolean') {
    throw new ApiError(
      'INVALID_RESPONSE',
      res.ok ? '服务返回了无法解析的数据' : `请求失败（HTTP ${res.status}）`,
      res.status,
    );
  }

  if (!payload.ok) {
    throw new ApiError(
      payload.error.code,
      payload.error.message,
      res.status,
      payload.error.reasons ?? [],
    );
  }

  return payload.data;
}

// ───────────────────────── 认证（§1） ─────────────────────────

export type Role = 'user' | 'admin';

/** GET /api/auth/me 的 data */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: number;
}

/** GET /api/auth/me —— 未登录时抛 ApiError('UNAUTHORIZED') */
export function getMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

/** POST /api/auth/logout */
export function logout(): Promise<{ loggedOut: boolean }> {
  return request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
}

// ───────────────────────── 投稿（§2） ─────────────────────────

/** 门禁结果（§4 / §8.2；与 api/src/types.ts 的 GateResult 同构） */
export interface GateHit {
  id: string;
  why: string;
}

export interface GateResult {
  tier: Tier;
  approvals: number;
  decision: 'auto-publish' | 'needs-human';
  reasons: string[];
  hits: GateHit[];
}

export interface CreateQuestionInput {
  title: string;
  content: string;
  analysis: string;
  category: string;
}

/** POST /api/questions 的 data（§2） */
export interface CreateQuestionResult {
  id: string;
  status: Status;
  gate: GateResult;
}

/** POST /api/questions（需登录） */
export function createQuestion(input: CreateQuestionInput): Promise<CreateQuestionResult> {
  return request<CreateQuestionResult>('/questions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 评论列表项（§2 GET /api/questions/:id/comments） */
export interface CommentItem {
  id: string;
  questionId: string;
  userId: string;
  userName: string;
  content: string;
  status: Status;
  createdAt: number;
  /** true = AI 回答 */
  isAi: boolean;
  /** AI 回答引用的用户提问 */
  quote: string | null;
  /** 门禁判定的风险等级 */
  riskTier: Tier;
}

/** GET /api/questions/:id/comments（只含 published） */
export function getComments(
  questionId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Page<CommentItem>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<Page<CommentItem>>(
    `/questions/${encodeURIComponent(questionId)}/comments${query ? `?${query}` : ''}`,
  );
}

// ───────────────────────── 管理（§3） ─────────────────────────

export type QueueKind = 'question' | 'comment';

/** GET /api/admin/queue 的 items 形状（§3） */
export interface QueueItem {
  id: string;
  kind: QueueKind;
  title: string;
  content: string;
  category: string;
  riskTier: Tier;
  /** 投稿时门禁算出的原因，审核台必须显著展示（§3 / §8.2） */
  gateReasons: string[];
  authorName: string;
  createdAt: number;
}

export interface AdminQueue {
  items: QueueItem[];
  total: number;
}

/** GET /api/admin/queue（需 admin） */
export function getAdminQueue(
  params: { type?: 'questions' | 'comments'; tier?: Tier } = {},
): Promise<AdminQueue> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.tier) qs.set('tier', params.tier);
  const query = qs.toString();
  return request<AdminQueue>(`/admin/queue${query ? `?${query}` : ''}`);
}

export interface ReviewInput {
  type: QueueKind;
  id: string;
  action: 'approve' | 'reject';
  /** action='reject' 时必填（服务端 zod 强校验） */
  reason?: string;
}

/** POST /api/admin/review 的 data（§8.3） */
export interface ReviewResult {
  id: string;
  type: QueueKind;
  status: Status;
}

/** POST /api/admin/review（需 admin） */
export function review(input: ReviewInput): Promise<ReviewResult> {
  return request<ReviewResult>('/admin/review', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/admin/stats 的 data（§3） */
export interface AdminStats {
  queue: { questions: number; comments: number };
  today: { published: number; rejected: number };
  ai: { neurons: number };
  /** 门禁判为 high 的 AI 回答数 */
  flagged?: number;
  /** 访问统计（§14）：today / last7 按 UTC 日切分，topPaths 为近 7 天前 5 */
  pv?: {
    today: number;
    last7: number;
    topPaths: Array<{ path: string; count: number }>;
  };
}

/** GET /api/admin/stats（需 admin） */
export function getAdminStats(): Promise<AdminStats> {
  return request<AdminStats>('/admin/stats');
}

// ───────────────────────── 评论提交（§2） ─────────────────────────

/** POST /api/questions/:id/comments 的 data */
export interface CreateCommentResult {
  id: string;
  status: Status;
  gate?: GateResult;
}

/** 发评论（需登录；入库 pending，等审核） */
export function postComment(questionId: string, content: string): Promise<CreateCommentResult> {
  return request<CreateCommentResult>(
    `/questions/${encodeURIComponent(questionId)}/comments`,
    { method: 'POST', body: JSON.stringify({ content }) },
  );
}

// ───────────────────────── 个人中心（§9） ─────────────────────────

/** GET /api/me/questions（需登录；不受 status 限制） */
export function getMyQuestions(
  params: { page?: number; pageSize?: number } = {},
): Promise<Page<MyQuestionSummary>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<Page<MyQuestionSummary>>(`/me/questions${query ? `?${query}` : ''}`);
}

/** GET /api/me/comments（需登录；不受 status 限制） */
export function getMyComments(
  params: { page?: number; pageSize?: number } = {},
): Promise<Page<MyComment>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<Page<MyComment>>(`/me/comments${query ? `?${query}` : ''}`);
}
/** POST /api/admin/visibility —— 下架（hidden）或恢复（published） */
export function setVisibility(
  type: QueueKind,
  id: string,
  hidden: boolean,
): Promise<{ id: string; type: QueueKind; status: Status }> {
  return request<{ id: string; type: QueueKind; status: Status }>('/admin/visibility', {
    method: 'POST',
    body: JSON.stringify({ type, id, hidden }),
  });
}
// ───────────────────────── AI 追问（§11） ─────────────────────────

export interface AiAskHandlers {
  onDelta: (text: string) => void;
  onDone?: (meta: { used: number; limit: number }) => void;
}

/**
 * POST /api/ai/ask —— SSE 流式。
 * 失败时抛 ApiError（RATE_LIMITED / UNAUTHORIZED / NOT_FOUND / INTERNAL）。
 * 传 AbortSignal 可中途停止（服务端会静默收尾）。
 */
export async function askAi(
  questionId: string,
  message: string,
  handlers: AiAskHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ questionId, message }),
      credentials: 'include',
      signal,
    });
  } catch {
    throw new ApiError('NETWORK', '无法连接服务器，请检查网络后重试');
  }

  if (!res.ok || !res.body) {
    let payload: { error?: { code?: string; message?: string } } | undefined;
    try {
      payload = (await res.json()) as { error?: { code?: string; message?: string } };
    } catch {
      payload = undefined;
    }
    throw new ApiError(
      (payload?.error?.code as never) ?? 'INTERNAL',
      payload?.error?.message ?? `请求失败（HTTP ${res.status}）`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let event: { content?: string; done?: boolean; used?: number; limit?: number; error?: string };
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      if (event.error) throw new ApiError('INTERNAL', event.error);
      if (event.content) handlers.onDelta(event.content);
      if (event.done) {
        handlers.onDone?.({ used: event.used ?? 0, limit: event.limit ?? 20 });
        return;
      }
    }
  }
}
/** POST /api/questions/:id/ai-comments —— 把一次 AI 问答落成评论 */
export function postAiComment(
  questionId: string,
  question: string,
  answer: string,
): Promise<{ id: string; status: Status; gate: GateResult }> {
  return request<{ id: string; status: Status; gate: GateResult }>(
    `/questions/${encodeURIComponent(questionId)}/ai-comments`,
    { method: 'POST', body: JSON.stringify({ question, answer }) },
  );
}
/** POST /api/admin/generate —— 手动让 AI 生成一道题（需 admin） */
export function generateQuestion(category: string): Promise<{
  id: string;
  title: string;
  category: string;
  tier: Tier;
  status: Status;
}> {
  return request('/admin/generate', {
    method: 'POST',
    body: JSON.stringify({ category }),
  });
}
// ───────────────────────── 图片上传（§15） ─────────────────────────

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

/** 上传图片（原始二进制 + Content-Type），返回站内路径 */
export async function uploadImage(file: File): Promise<UploadResult> {
  let res: Response;
  try {
    res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('NETWORK', '无法连接服务器，请检查网络后重试');
  }

  let payload: { ok?: boolean; data?: UploadResult; error?: { code?: string; message?: string } } | undefined;
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = undefined;
  }

  if (!payload || payload.ok !== true || !payload.data) {
    throw new ApiError(
      (payload?.error?.code as never) ?? 'INTERNAL',
      payload?.error?.message ?? `上传失败（HTTP ${res.status}）`,
      res.status,
    );
  }
  return payload.data;
}
// ───────────────────────── AI 解答（§11.1） ─────────────────────────

export interface AiCompleteResult {
  content: string;
  analysis: string;
  used: number;
  limit: number;
}

/** 给标题，让 AI 补正文与解析（投稿页用；与 AI 追问共用每日额度） */
export function completeWithAi(input: { title: string; category?: string }): Promise<AiCompleteResult> {
  return request<AiCompleteResult>('/ai/complete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
// ───────────────────── 题库管理（§17）─────────────────────

export interface AdminQuestionItem {
  id: string;
  title: string;
  category: string;
  status: Status;
  riskTier: Tier;
  isAi: boolean;
  authorId: string | null;
  createdAt: number;
  hasAnalysis: boolean;
}

export interface AdminQuestionQuery {
  category?: string;
  status?: string;
  q?: string;
  hasAnalysis?: 'yes' | 'no';
  page?: number;
  pageSize?: number;
}

/** GET /api/admin/questions（需 admin，含所有状态） */
export function getAdminQuestions(params: AdminQuestionQuery = {}): Promise<Page<AdminQuestionItem>> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  if (params.hasAnalysis) qs.set('hasAnalysis', params.hasAnalysis);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<Page<AdminQuestionItem>>(`/admin/questions${query ? `?${query}` : ''}`);
}

/** POST /api/admin/questions/delete（硬删除，不可恢复） */
export function deleteAdminQuestions(ids: string[]): Promise<{ requested: number; deleted: number }> {
  return request<{ requested: number; deleted: number }>('/admin/questions/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}