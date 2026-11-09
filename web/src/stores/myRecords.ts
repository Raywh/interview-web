/**
 * 「我的投稿 / 我的评论」本机记录。
 *
 * 为什么是本机记录：契约（docs/api.md）里**没有**「我的投稿列表」接口，也没有
 * 「我的评论列表」接口，只能按 id 查单条题目（作者可读 pending/rejected）、
 * 按题目查已发布评论。所以前端在提交成功时把 id 记在 localStorage，
 * 列表页再用 GET /api/questions/:id 拉最新状态。
 *
 * 已知限制（已在 A5 交付报告里标注）：
 *  - 换设备 / 清缓存后列表丢失；
 *  - 拒绝理由 reject_reason 不在 GET /api/questions/:id 的返回里，
 *    所以「已拒绝 + 原因」只能显示状态、拿不到原因。
 */
import type { Status } from '../api/types';

const STORAGE_KEY = 'interview:my-records:v1';
/** 本机最多保留多少条（避免 localStorage 无限增长） */
const MAX_RECORDS = 50;

export interface MyQuestionRecord {
  kind: 'question';
  id: string;
  title: string;
  category: string;
  createdAt: number;
  status: Status;
  /** 服务端已查不到该 id（被删 / 无权查看） */
  unavailable?: boolean;
}

export interface MyCommentRecord {
  kind: 'comment';
  id: string;
  questionId: string;
  questionTitle: string;
  content: string;
  createdAt: number;
  status: Status;
}

export type MyRecord = MyQuestionRecord | MyCommentRecord;

const STATUSES: readonly string[] = ['published', 'pending', 'rejected', 'hidden'];

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && STATUSES.includes(value);
}

function isRecord(value: unknown): value is MyRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;

  if (item.kind === 'question') {
    return (
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.createdAt === 'number' &&
      isStatus(item.status)
    );
  }

  if (item.kind === 'comment') {
    return (
      typeof item.id === 'string' &&
      typeof item.questionId === 'string' &&
      typeof item.createdAt === 'number' &&
      isStatus(item.status)
    );
  }

  return false;
}

/** 读取本机记录；坏数据 / 隐私模式一律降级成空数组，不让列表页挂掉 */
export function loadMyRecords(): MyRecord[] {
  let raw = '';
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveMyRecords(records: MyRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // 配额满 / 隐私模式：忽略，本次会话内仍可用
  }
}

function upsert(record: MyRecord): void {
  const rest = loadMyRecords().filter(
    (item) => !(item.kind === record.kind && item.id === record.id),
  );
  saveMyRecords([record, ...rest].slice(0, MAX_RECORDS));
}

export function addMyQuestionRecord(record: MyQuestionRecord): void {
  upsert(record);
}

export function addMyCommentRecord(record: MyCommentRecord): void {
  upsert(record);
}
