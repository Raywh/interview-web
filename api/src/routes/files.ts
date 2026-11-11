/**
 * 图片上传与读取 —— 挂载在 /api（docs/api.md §15）
 *
 *  POST /api/upload        需登录；body 直接是二进制，Content-Type 标明图片类型
 *  GET  /api/files/<key>   公开读取（长缓存）
 *
 * 为什么用 KV 不是 R2：R2 开通必须绑卡（即使免费额度内也会产生账单记录），
 * 而本项目要求「一分钱不花、不绑卡」。Workers KV 在免费计划里是硬额度
 * （1 GB 存储 / 1000 次写/天），超额直接拒绝，不产生费用。
 *
 * 限制：
 *   - 单文件 ≤ 2 MB（KV 单值上限 25 MB，但图片没必要存那么大）
 *   - 只接受 png / jpeg / webp / gif
 *   - 每用户每天 20 次上传（防止刷 KV 写入额度）
 */
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { newId } from '../lib/id';
import { fail, ok } from '../lib/response';

export const filesRoute = new Hono<AppEnv>();

const MAX_BYTES = 2 * 1024 * 1024;
const DAILY_UPLOADS = 20;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** 上传：POST /api/upload */
filesRoute.post('/upload', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const contentType = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = MIME_EXT[contentType];
  if (!ext) {
    return fail('VALIDATION', '只支持 png / jpeg / webp / gif 图片', ['file']);
  }

  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    return fail('VALIDATION', '图片不能超过 2 MB', ['file']);
  }

  const buffer = await c.req.arrayBuffer();
  if (buffer.byteLength === 0) {
    return fail('VALIDATION', '文件为空', ['file']);
  }
  if (buffer.byteLength > MAX_BYTES) {
    return fail('VALIDATION', '图片不能超过 2 MB', ['file']);
  }

  // 每用户每天 20 次（复用 rate_limits 表，key 带日期）
  const day = utcDay(Date.now());
  const key = `upload:u:${user.id}:${day}`;
  const used = await c.env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number }>();
  if (used && Number(used.count) >= DAILY_UPLOADS) {
    return fail('RATE_LIMITED', `今天的上传次数已用完（每人每天 ${DAILY_UPLOADS} 次）`, [
      `${DAILY_UPLOADS}/day`,
    ]);
  }
  await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, count, expire_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET count = count + 1, expire_at = excluded.expire_at`,
  )
    .bind(key, Date.now() + 24 * 60 * 60 * 1000)
    .run();

  const objectKey = `u/${user.id}/${newId('f')}.${ext}`;
  await c.env.FILES.put(objectKey, buffer, {
    metadata: { contentType, size: buffer.byteLength, ownerId: user.id },
  });

  return ok({ key: objectKey, url: `/api/files/${objectKey}`, size: buffer.byteLength });
});

/** 读取：GET /api/files/<key>（公开，长缓存；key 里带随机后缀，不会变） */
filesRoute.get('/files/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, '');
  if (!key) return fail('NOT_FOUND', '文件不存在');

  const { value, metadata } = await c.env.FILES.getWithMetadata<{
    contentType?: string;
  }>(key, { type: 'arrayBuffer' });

  if (!value) return fail('NOT_FOUND', '文件不存在');

  return new Response(value, {
    headers: {
      'content-type': metadata?.contentType ?? 'application/octet-stream',
      // key 不可变，可长期缓存
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
});
