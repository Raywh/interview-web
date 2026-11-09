/**
 * 日志上报 —— 挂载在 /api/logs（docs/api.md §2）
 *
 * 无需登录；message 截断 2000 字符，meta 序列化后截断 4096。
 * IP 不落明文，只存 sha256 后的 ip_hash。
 *
 * TODO(A2 二期)：限流 log:ip:<ipHash> 60s/20 条（docs/api.md §6），rate_limits 表实现。
 */
import { Hono } from 'hono';
import type { AppEnv } from '../lib/env';
import { ok } from '../lib/response';
import { logInputSchema, zodFail } from '../lib/validate';

export const logsRoute = new Hono<AppEnv>();

/** 契约：message 截断 2KB，meta 截断 4KB */
const MESSAGE_MAX = 2000;
const META_MAX = 4096;

/** SHA-256 hex；用于把客户端 IP 变成不可逆的 ip_hash */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

logsRoute.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = logInputSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const { level, tag, message, meta, path } = parsed.data;
  const now = Date.now();

  // 不存明文 IP：cf-connecting-ip 优先，本地 dev 退回 x-forwarded-for
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const ipHash = ip ? await sha256Hex(`${c.env.JWT_SECRET ?? 'interview-web'}:${ip}`) : null;

  // meta 允许任意 JSON；序列化失败 / 非 JSON 值统一存 "null"
  let metaText: string | null = null;
  if (meta !== undefined) {
    try {
      metaText = JSON.stringify(meta) ?? null;
    } catch {
      metaText = null;
    }
  }
  if (metaText !== null && metaText.length > META_MAX) {
    // 直接截断会留下非法 JSON；包一层合法结构，保留前缀便于排查
    metaText = JSON.stringify({
      _truncated: true,
      _originalSize: metaText.length,
      preview: metaText.slice(0, META_MAX - 120),
    });
  }

  await c.env.DB.prepare(
    `INSERT INTO logs (level, tag, message, meta, path, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      level,
      tag,
      message.slice(0, MESSAGE_MAX),
      metaText,
      path ?? null,
      ipHash,
      now,
    )
    .run();

  return ok({ logged: true });
});
