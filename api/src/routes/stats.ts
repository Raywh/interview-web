/**
 * 统计路由 —— 挂载在 /api/stats（docs/api.md §2）
 *
 * 只统计 published；分类按白名单顺序输出，白名单里没有数据的也要给 count: 0。
 */
import { Hono } from 'hono';
import type { AppEnv } from '../lib/env';
import { ok } from '../lib/response';
import { CATEGORIES, type Category } from '../lib/validate';
import type { Stats } from '../types';

export const statsRoute = new Hono<AppEnv>();

statsRoute.get('/', async (c) => {
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM questions WHERE status = 'published'",
  ).first<{ c: number }>();
  const total = Number(totalRow?.c ?? 0);

  const grouped = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS c
       FROM questions
      WHERE status = 'published'
      GROUP BY category`,
  ).all<{ category: string; c: number }>();

  const counts = new Map<string, number>();
  for (const row of grouped.results ?? []) {
    counts.set(row.category, Number(row.c));
  }

  // 白名单顺序固定（前端 chip 顺序），缺失补 0
  const categories: Array<{ name: string; count: number }> = CATEGORIES.map((name) => ({
    name,
    count: counts.get(name) ?? 0,
  }));

  // 防御：A1 导入的历史数据若出现白名单外的分类，追加在末尾，保证 Σcategories == total
  for (const [name, count] of counts) {
    if (!CATEGORIES.includes(name as Category)) {
      categories.push({ name, count });
    }
  }

  return ok({ total, categories } satisfies Stats);
});
