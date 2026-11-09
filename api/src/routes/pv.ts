/**
 * 访问统计上报 —— 挂载在 /api/pv（docs/api.md §14）
 *
 *  POST /api/pv  body: { path }
 *    - 无需登录（前端在 router.afterEach 里上报）
 *    - path 归一化后按 UTC 日聚合：day = YYYY-MM-DD，UPSERT 累加 count
 *    - 同一 IP 每分钟最多 30 次；超限不写库，仍返回 200 + counted:false
 *      （beacon 请求不值得为限流制造浏览器错误；口径见 docs/api.md §14）
 *
 * 归一化规则：
 *   1. 去掉 query 和 hash（先切 # 再切 ?，因为 hash 里也可能带 ?）
 *   2. 超过 120 字符截断
 *   3. 白名单外的路径统一记成 /other，避免被随机 URL 撑爆 pageviews 表
 *      - 精确允许：/  /admin  /add  /me  /login
 *      - 前缀允许：/q/（保留题目 id，便于看哪道题最热）
 *      - 子路径允许：/admin/… /add/… /me/… /login/…
 */
import { Hono } from 'hono';
import type { AppEnv } from '../lib/env';
import { ok } from '../lib/response';

export const pvRoute = new Hono<AppEnv>();

/** 单条 path 的最大长度（契约：超过 120 字符截断） */
export const PV_PATH_MAX = 120;

/** 精确匹配的白名单路径 */
const EXACT_PATHS = new Set(['/', '/admin', '/add', '/me', '/login']);

/** 允许带子路径的前缀（/admin/xxx 等），/q/ 单独判断 */
const PREFIX_PATHS = ['/admin', '/add', '/me', '/login'];

/** 限流：同一 IP 每分钟最多 30 次上报 */
const RATE_LIMIT_MAX = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * 归一化上报的 path。
 * 非字符串 / 空值 / 站外路径 / 白名单外路径一律返回 '/other'（不让非法输入变成新行）。
 */
export function normalizePath(raw: unknown): string {
  if (typeof raw !== 'string') return '/other';

  // 先切 hash 再切 query；这里只取 path 部分
  const withoutHash = raw.trim().split('#', 1)[0] ?? '';
  let path = withoutHash.split('?', 1)[0] ?? '';

  if (path.length > PV_PATH_MAX) path = path.slice(0, PV_PATH_MAX);

  if (!path.startsWith('/')) return '/other';
  if (EXACT_PATHS.has(path)) return path;
  if (path.startsWith('/q/')) return path;
  if (PREFIX_PATHS.some((prefix) => path.startsWith(`${prefix}/`))) return path;

  return '/other';
}

/** SHA-256 hex：rate_limits 里不存明文 IP（与 logs 的 ip_hash 同一口径） */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** yyyyMMddHHmm（UTC），与 schema 里 rate_limits.key 的注释一致 */
function minuteKey(now: number): string {
  return new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

/** UTC 日期 YYYY-MM-DD（与 pageviews.day 口径一致） */
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

pvRoute.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const rawPath =
    body && typeof body === 'object' && 'path' in body
      ? (body as { path?: unknown }).path
      : undefined;
  const path = normalizePath(rawPath);

  const now = Date.now();

  // 不存明文 IP：cf-connecting-ip 优先，本地 dev 退回 x-forwarded-for
  const headerIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const ip = headerIp.split(',')[0]?.trim() ?? '';
  const ipKey = ip
    ? await sha256Hex(`${c.env.JWT_SECRET ?? 'interview-web'}:${ip}`)
    : 'unknown';
  const key = `pv:ip:${ipKey}:${minuteKey(now)}`;

  // 先看本分钟窗口是否已到上限；到了就静默跳过（不写 pageviews，也不递增计数）
  const used = await c.env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number }>();
  if (used && Number(used.count) >= RATE_LIMIT_MAX) {
    return ok({ counted: false });
  }

  await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, count, expire_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET count = count + 1, expire_at = excluded.expire_at`,
  )
    .bind(key, now + RATE_WINDOW_MS)
    .run();

  // 按 (day, path) 聚合：一天一道题只占一行
  await c.env.DB.prepare(
    `INSERT INTO pageviews (day, path, count) VALUES (?, ?, 1)
     ON CONFLICT(day, path) DO UPDATE SET count = count + 1`,
  )
    .bind(utcDay(now), path)
    .run();

  return ok({ counted: true });
});
