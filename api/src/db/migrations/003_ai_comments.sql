-- 003_ai_comments.sql
-- 让 AI 问答能落在评论区：
--   is_ai = 1 表示这条是 AI 生成的回答
--   quote 存用户的原提问（展示成引用块），避免 AI 回答没有上下文
ALTER TABLE comments ADD COLUMN is_ai INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN quote TEXT;
