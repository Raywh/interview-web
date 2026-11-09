-- 002_ai_usage.sql
-- 背景：AI 追问需要按用户按天限额（每人每天 20 次），否则免费额度会被单人刷完。
-- 新库由 schema.sql 直接建出；已存在的库用本文件补齐。

CREATE TABLE IF NOT EXISTS ai_usage (
  day     TEXT NOT NULL,
  user_id TEXT NOT NULL,
  calls   INTEGER NOT NULL DEFAULT 0,
  neurons INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);
