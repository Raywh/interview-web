-- 004_pageviews.sql
-- 背景：访问统计（PV）需要按天聚合。若每次上报都 INSERT 一行，
--       D1 的行数会随访问量线性膨胀，管理端查「今日 / 近 7 天」也会变慢。
-- 口径：
--   day   = UTC 日期（YYYY-MM-DD），日切分以 UTC 0 点为界
--   path  = 归一化后的路径（/  /q/xxx  /admin  /other …），规则见 api/src/routes/pv.ts
-- 新库由 schema.sql 直接建出；已存在的库用本文件补齐。

CREATE TABLE IF NOT EXISTS pageviews (
  day   TEXT NOT NULL,     -- YYYY-MM-DD（UTC）
  path  TEXT NOT NULL,     -- 归一化后的路径，如 /  /q/xxx  /admin
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
