/**
 * users 表的读写助手（github / email 两种 provider 共用）。
 *
 * 表结构见 api/src/db/schema.sql：
 *   UNIQUE (provider, provider_id) —— github 用数字 uid，email 用规范化邮箱
 * 所有 SQL 都是参数绑定，不做字符串拼接。
 */
import { newId } from '../lib/id';
import type { Env, Role, User } from '../types';

/** users 整行（只取契约需要的列） */
export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  created_at: number;
}

/** D1 行 → 契约 User（role 只认 'admin'，其它一律降级为 'user'） */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role === 'admin' ? 'admin' : 'user',
    createdAt: row.created_at,
  };
}

/** ADMIN_EMAILS 是逗号分隔的邮箱列表（大小写不敏感） */
export function isAdminEmail(env: Pick<Env, 'ADMIN_EMAILS'>, email: string | null): boolean {
  if (!email) return false;
  const list = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export interface ProviderProfile {
  provider: 'github' | 'email';
  providerId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

const SELECT_USER = 'SELECT id, name, email, avatar_url, role, created_at FROM users WHERE provider = ? AND provider_id = ?';

/**
 * upsert：先按 (provider, provider_id) 找，找到就更新资料，找不到就插入。
 * role 规则：命中 ADMIN_EMAILS → admin；已存在的 admin 不会被降级；其余 user。
 */
export async function upsertProviderUser(
  db: D1Database,
  profile: ProviderProfile,
  admin: boolean,
): Promise<{ user: User; created: boolean }> {
  const existing = await db.prepare(SELECT_USER).bind(profile.provider, profile.providerId).first<UserRow>();
  const now = Date.now();

  if (existing) {
    const role: Role = admin || existing.role === 'admin' ? 'admin' : 'user';
    const name = profile.name || existing.name;
    const email = profile.email ?? existing.email;
    const avatarUrl = profile.avatarUrl ?? existing.avatar_url;

    await db
      .prepare('UPDATE users SET name = ?, email = ?, avatar_url = ?, role = ? WHERE id = ?')
      .bind(name, email, avatarUrl, role, existing.id)
      .run();

    return {
      user: { id: existing.id, name, email, avatarUrl, role, createdAt: existing.created_at },
      created: false,
    };
  }

  const id = newId('u');
  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, avatar_url, provider, provider_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        profile.email,
        profile.name,
        profile.avatarUrl,
        profile.provider,
        profile.providerId,
        admin ? 'admin' : 'user',
        now,
      )
      .run();
  } catch (err) {
    // 并发首登：唯一索引 (provider, provider_id) 冲突时回读一次，不把 500 抛给用户
    const raced = await db.prepare(SELECT_USER).bind(profile.provider, profile.providerId).first<UserRow>();
    if (!raced) throw err;
    return { user: toUser(raced), created: false };
  }

  return {
    user: {
      id,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      role: admin ? 'admin' : 'user',
      createdAt: now,
    },
    created: true,
  };
}
