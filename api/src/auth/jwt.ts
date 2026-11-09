/**
 * JWT（HS256）签发 / 校验 —— 零依赖，只用 WebCrypto（Workers 与 Node 18+ 都有）。
 *
 * 契约（docs/api.md §0 / §1）：
 *   - 会话 `sid` cookie 7 天有效
 *   - OAuth `state` 5 分钟有效（防 CSRF）
 *   - 载荷除了 `SessionPayload`（sub / role / iat / exp）再带一个 `purpose`，
 *     防止「用回调 state 冒充会话 cookie」这类跨用途重放。
 *
 * 注意：`api/src/types.ts` 已冻结，`SessionPayload` 里没有 purpose 字段，
 * 所以这里定义扩展类型 `AuthPayload`，不改契约文件。
 */
import type { Env, Role, SessionPayload, User } from '../types';

/** token 用途：会话 / OAuth state / 邮件登录 */
export type TokenPurpose = 'session' | 'state' | 'email';

/** 会话 7 天（docs/api.md §0） */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** OAuth state 5 分钟（docs/api.md §1） */
export const STATE_TTL_SECONDS = 5 * 60;
/** 邮件登录 token 15 分钟（契约未规定，取保守值） */
export const EMAIL_TTL_SECONDS = 15 * 60;

/** 契约的 SessionPayload + purpose */
export interface AuthPayload extends SessionPayload {
  purpose: TokenPurpose;
}

/** 本地兜底密钥：wrangler dev 没有 .dev.vars 时 JWT_SECRET 为空 */
const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret-do-not-deploy';
/** 只提示一次，避免每个请求刷日志 */
let warnedSecret = false;

/**
 * 取签名密钥。
 *
 * 生产必须配 `JWT_SECRET`（wrangler secret put JWT_SECRET）；
 * 本地 wrangler dev 默认没有 .dev.vars，为让 OAuth / 会话流程能联调，
 * 这里退回固定 dev 密钥并打一次警告。**绝不能用这个跑生产**。
 */
export function resolveJwtSecret(env: Pick<Env, 'JWT_SECRET'>): string {
  const secret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  if (secret.length >= 16) return secret;
  if (!warnedSecret) {
    warnedSecret = true;
    console.warn('[auth] JWT_SECRET 未配置或过短（<16），使用本地开发兜底密钥');
  }
  return DEV_FALLBACK_SECRET;
}

// ── base64url（JWT 用无填充的 URL 安全 base64）──────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 预计算反查表：charCode → 6bit 值，-1 表示非法字符 */
const B64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i += 1) table[B64_CHARS.charCodeAt(i)] = i;
  return table;
})();

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += B64_CHARS.charAt((b0 >> 2) & 63);
    out += B64_CHARS.charAt(((b0 & 3) << 4) | ((b1 ?? 0) >> 4));
    if (b1 === undefined) break;
    out += B64_CHARS.charAt(((b1 & 15) << 2) | ((b2 ?? 0) >> 6));
    if (b2 === undefined) break;
    out += B64_CHARS.charAt(b2 & 63);
  }
  return out;
}

function base64UrlToBytes(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;

  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? (B64_LOOKUP[code] ?? -1) : -1;
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HEADER_SEGMENT = bytesToBase64Url(
  encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
);

function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** 签发：header.payload.signature，payload 必须自带 iat / exp / purpose */
export async function signJwt(payload: AuthPayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const data = `${HEADER_SEGMENT}.${body}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function isAuthPayload(value: unknown): value is AuthPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.sub === 'string' &&
    o.sub.length > 0 &&
    (o.role === 'user' || o.role === 'admin') &&
    typeof o.iat === 'number' &&
    typeof o.exp === 'number' &&
    (o.purpose === 'session' || o.purpose === 'state' || o.purpose === 'email')
  );
}

/**
 * 校验签名 + 结构 + 过期时间。
 * 任何不合法（签名错、过期、purpose 未知、结构被改）一律返回 null，不抛异常。
 */
export async function verifyJwt(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<AuthPayload | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts as [string, string, string];
  if (header !== HEADER_SEGMENT) return null;

  const sigBytes = base64UrlToBytes(signature);
  if (!sigBytes || sigBytes.length !== 32) return null;

  const key = await importHmacKey(secret);
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(`${header}.${body}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const payloadBytes = base64UrlToBytes(body);
  if (!payloadBytes) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return null;
  }
  if (!isAuthPayload(parsed)) return null;

  const nowSeconds = Math.floor(now / 1000);
  if (parsed.exp <= nowSeconds) return null;
  // iat 晚于当前时间太多说明时钟/伪造异常（容忍 60s 偏差）
  if (parsed.iat > nowSeconds + 60) return null;

  return parsed;
}

function toIat(now: number): number {
  return Math.floor(now / 1000);
}

/** 会话载荷：sub = user id，role = 签发时的角色 */
export function sessionPayload(
  user: Pick<User, 'id' | 'role'>,
  now: number = Date.now(),
): AuthPayload {
  const iat = toIat(now);
  return { sub: user.id, role: user.role, iat, exp: iat + SESSION_TTL_SECONDS, purpose: 'session' };
}

/** 签会话 JWT（7 天） */
export async function signSession(
  user: Pick<User, 'id' | 'role'>,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  return signJwt(sessionPayload(user, now), secret);
}

/** OAuth state：5 分钟，sub 放一次性 nonce，回调时不需要额外存储 */
export function statePayload(now: number = Date.now()): AuthPayload {
  const iat = toIat(now);
  return {
    sub: crypto.randomUUID(),
    role: 'user' as Role,
    iat,
    exp: iat + STATE_TTL_SECONDS,
    purpose: 'state',
  };
}

export async function signState(secret: string, now: number = Date.now()): Promise<string> {
  return signJwt(statePayload(now), secret);
}

/** 邮件登录 token：sub = 规范化后的邮箱 */
export function emailPayload(email: string, now: number = Date.now()): AuthPayload {
  const iat = toIat(now);
  return {
    sub: email,
    role: 'user',
    iat,
    exp: iat + EMAIL_TTL_SECONDS,
    purpose: 'email',
  };
}

export async function signEmailToken(
  email: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  return signJwt(emailPayload(email, now), secret);
}
