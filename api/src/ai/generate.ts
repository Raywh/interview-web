/**
 * AI 出题 —— 供「每日 Cron」与「管理员手动生成」共用（docs/api.md §13）
 *
 * 模型选 deepseek-r1-distill-qwen-32b：一天只生成 5 条，质量优先。
 * 免费额度 1 万 neurons/天，5 条 ≈ 1.8k，留足余量给用户追问。
 */
import { newId } from '../lib/id';
import { evaluate } from '../moderation/gate';
import type { Env } from '../types';

const MODEL = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';

/** 每日轮换生成的分类（与小程序一致） */
export const DAILY_CATEGORIES = ['Vue', 'React', '工程化', 'CSS', 'JS'] as const;

export interface GeneratedQuestion {
  id: string;
  title: string;
  category: string;
  tier: string;
  status: string;
}

/** 从模型输出里抠出 JSON（可能被 ```json 包裹，也可能带前后废话） */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? Array.from(value).slice(0, max).join('').trim() : '';
}

/**
 * 生成一道题并入库。
 * 返回 null 表示本次没生成（模型失败 / 解析失败 / 标题重复）。
 */
export async function generateQuestion(
  env: Env,
  category: string,
): Promise<GeneratedQuestion | null> {
  // 该分类最近 30 个标题，作为「禁止重复」清单
  const recent = await env.DB.prepare(
    'SELECT title FROM questions WHERE category = ? ORDER BY created_at DESC LIMIT 30',
  )
    .bind(category)
    .all<{ title: string }>();
  const avoid = (recent.results ?? []).map((row) => row.title);

  const prompt = [
    `你是一位资深前端面试官。请为分类「${category}」出一道有深度的面试题。`,
    '要求：',
    '1. 贴近真实面试，考察原理或工程判断，不要「什么是 X」这种概念复述。',
    '2. 必须包含 title（题干，30-60 字）、content（题目描述/场景，100-300 字）、analysis（详细解析，400-1000 字，可用 Markdown 和代码块）。',
    '3. 解析先给结论再分点，不要空话。',
    '4. 不要与下列已有题目重复：',
    avoid.length ? avoid.map((t) => `   - ${t}`).join('\n') : '   （暂无）',
    '5. 只输出 JSON，不要任何解释文字、不要 Markdown 代码块包裹。格式：',
    '{"title":"...","content":"...","analysis":"..."}',
  ].join('\n');

  let raw = '';
  try {
    const result = (await env.AI.run(MODEL as never, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1600,
    } as never)) as { response?: string };
    raw = result?.response ?? '';
  } catch (err) {
    console.error('[generate] ai.run failed', err);
    return null;
  }

  const parsed = extractJson(raw);
  if (!parsed) {
    console.error('[generate] 解析失败', raw.slice(0, 200));
    return null;
  }

  const title = clip(parsed.title, 200);
  const content = clip(parsed.content, 20000);
  const analysis = clip(parsed.analysis, 20000);
  if (!title || !content || !analysis) {
    console.error('[generate] 字段缺失', { title: !!title, content: !!content, analysis: !!analysis });
    return null;
  }

  // 标题重复直接丢弃
  const dup = await env.DB.prepare('SELECT 1 AS ok FROM questions WHERE title = ? LIMIT 1')
    .bind(title)
    .first<{ ok: number }>();
  if (dup) {
    console.warn('[generate] 标题重复，跳过：', title);
    return null;
  }

  const gate = evaluate({ title, content, analysis });
  // AI 生成内容同样过门禁；high 也照样发布（机器来源可控），但留痕
  const id = newId('q');
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO questions
       (id, title, content, analysis, category, author_id, is_ai, status, risk_tier,
        gate_reasons, review_round, reject_reason, views, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, 'published', ?, ?, 0, NULL, 0, ?, ?)`,
  )
    .bind(id, title, content, analysis, category, gate.tier, JSON.stringify(gate.reasons), now, now)
    .run();

  if (gate.tier === 'high') {
    await env.DB.prepare(
      'INSERT INTO logs (level, tag, message, meta, path, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    )
      .bind(
        'warn',
        'ai.generate_high_risk',
        `AI 生成的题目被判为高风险（${category}）`,
        JSON.stringify({ questionId: id, reasons: gate.reasons }).slice(0, 4096),
        '/',
        now,
      )
      .run();
  }

  return { id, title, category, tier: gate.tier, status: 'published' };
}
