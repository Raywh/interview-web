-- 001_add_gate_reasons.sql
-- 背景：契约要求审核台展示门禁命中原因（docs/api.md §3 gateReasons），
--       但 v1 schema 只有 risk_tier，没有存 reasons 的地方。
-- 处理：questions / comments 各加一列，存 JSON 数组字符串，如 ["含外链","疑似手机号"]。
-- 新库直接由 schema.sql 建出该列；已存在的库用本文件补齐。

ALTER TABLE questions ADD COLUMN gate_reasons TEXT;
ALTER TABLE comments ADD COLUMN gate_reasons TEXT;
