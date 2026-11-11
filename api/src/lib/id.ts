/**
 * ULID 生成（schema.sql 约定：所有 id 为 26 字符 ULID，天然有序）。
 *
 * Workers 里没有 node:crypto 的 randomBytes，用 crypto.getRandomValues 即可。
 * 不做新依赖，保持 0 安装。
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32

/** 生成 26 字符 ULID：10 字符时间戳（48bit）+ 16 字符随机（80bit） */
export function ulid(now: number = Date.now()): string {
  let time = '';
  let rest = now;
  for (let i = 0; i < 10; i += 1) {
    time = ENCODING.charAt(rest % 32) + time;
    rest = Math.floor(rest / 32);
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let random = '';
  for (const byte of bytes) {
    random += ENCODING.charAt(byte % 32);
  }

  return time + random;
}

/** 契约里的业务前缀：q_ / c_ / u_ */
export function newId(prefix: 'q' | 'c' | 'u' | 'f'): string {
  return `${prefix}_${ulid()}`;
}
