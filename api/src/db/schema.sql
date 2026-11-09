-- 面试题库 Web · D1 schema（v1，契约冻结版）
-- 约定：
--   * 所有时间用 epoch 毫秒（INTEGER），不用 TEXT 日期
--   * 新建记录用 ULID（26 字符）；历史导入数据沿用源 _id（24 位 ObjectId），两种格式共存
--   * 状态机见 docs/api.md §5
-- 变更流程：只允许 A0 修改本文件；任何字段增删都要同步 docs/api.md 与 api/src/types.ts

-- ── 用户 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT,                       -- 可空：GitHub 用户可能不公开邮箱
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  provider     TEXT NOT NULL,              -- 'github' | 'email'
  provider_id  TEXT NOT NULL,              -- GitHub uid / 规范化邮箱
  role         TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_provider ON users(provider, provider_id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

-- ── 题目 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,             -- Markdown
  analysis      TEXT NOT NULL,             -- Markdown
  category      TEXT NOT NULL,
  author_id     TEXT REFERENCES users(id),
  is_ai         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
                                           -- 'published' | 'pending' | 'rejected' | 'hidden'
  risk_tier     TEXT NOT NULL DEFAULT 'low',   -- 'high' | 'medium' | 'low'（门禁判定结果）
  gate_reasons  TEXT,                            -- JSON 数组：门禁命中原因，审核台必须展示
  review_round  INTEGER NOT NULL DEFAULT 0,    -- 被打回次数，用于轮次上限
  reject_reason TEXT,
  views         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_q_cat_time    ON questions(category, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_q_pub_time    ON questions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_q_queue       ON questions(status, risk_tier, created_at ASC);
CREATE INDEX IF NOT EXISTS ix_q_author      ON questions(author_id, created_at DESC);

-- ── 评论 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  risk_tier     TEXT NOT NULL DEFAULT 'low',
  gate_reasons  TEXT,
  review_round  INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_c_q_time ON comments(question_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_c_queue  ON comments(status, risk_tier, created_at ASC);

-- ── 日志 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL,                -- 'error' | 'warn' | 'info'
  tag        TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       TEXT,                         -- JSON 字符串
  path       TEXT,                         -- 客户端路由
  ip_hash    TEXT,                         -- 不存明文 IP
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_logs_time ON logs(created_at DESC);

-- ── 限流 ─────────────────────────────────────────────
-- key 形如：'comment:u:<userId>:<yyyyMMddHHmm>'
CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 0,
  expire_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rate_expire ON rate_limits(expire_at);

-- ── AI 用量（按用户按天，用于额度守卫）──────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  day     TEXT NOT NULL,                -- YYYY-MM-DD（UTC）
  user_id TEXT NOT NULL,
  calls   INTEGER NOT NULL DEFAULT 0,
  neurons INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);

-- ── 访问统计（PV，按天聚合）──────────────────────────
-- day 用 UTC 日期；path 为归一化后的路径（见 api/src/routes/pv.ts）
CREATE TABLE IF NOT EXISTS pageviews (
  day   TEXT NOT NULL,     -- YYYY-MM-DD（UTC）
  path  TEXT NOT NULL,     -- 归一化后的路径，如 /  /q/xxx  /admin
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);