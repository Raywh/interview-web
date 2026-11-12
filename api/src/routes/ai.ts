/**
 * AI 追问 —— 挂载在 /api/ai（docs/api.md §11）
 *
 *  POST /api/ai/ask  需登录，SSE 流式返回
 *
 * 设计要点：
 *  - 每人每天 20 次（ai_usage 表按 UTC 日计数），防止免费额度被单人刷完
 *  - 模型用 qwen3-30b-a3b-fp8：免费额度下约 450 次/天；换成 R1 只有约 15 次
 *  - prompt 只带本题的标题/内容/解析（截断），不带全库，省 token
 *  - 前端断开（AbortController）时 reader 会抛错，这里静默收尾
 */
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../lib/env';
import { currentUser } from '../lib/env';
import { fail, ok } from '../lib/response';
import { extractJsonObject } from '../lib/json';
import { aiAskSchema, aiCompleteSchema, zodFail } from '../lib/validate';

export const aiRoute = new Hono<AppEnv>();

/** 免费额度下性价比最高的选择（见 docs/api.md §11） */
const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const DAILY_LIMIT = 20;
const MAX_CONTEXT = 3000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text ?? '');
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

aiRoute.post('/ask', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = aiAskSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const { questionId, message } = parsed.data;

  const question = await c.env.DB.prepare(
    "SELECT title, content, analysis FROM questions WHERE id = ? AND status = 'published'",
  )
    .bind(questionId)
    .first<{ title: string; content: string; analysis: string }>();
  if (!question) return fail('NOT_FOUND', '题目不存在或未发布');

  const day = todayUtc();
  const usage = await c.env.DB.prepare('SELECT calls FROM ai_usage WHERE day = ? AND user_id = ?')
    .bind(day, user.id)
    .first<{ calls: number }>();
  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return fail('RATE_LIMITED', `今天的 AI 提问次数已用完（每人每天 ${DAILY_LIMIT} 次）`, [
      `${DAILY_LIMIT}/day`,
    ]);
  }

  // 先计数再调用：失败也算一次，避免反复重试刷额度
  await c.env.DB.prepare(
    `INSERT INTO ai_usage (day, user_id, calls) VALUES (?, ?, 1)
     ON CONFLICT(day, user_id) DO UPDATE SET calls = calls + 1`,
  )
    .bind(day, user.id)
    .run();

  // 多轮上下文：取这道题最近 3 轮「AI 问答」作为历史，让追问能接着聊
  const historyRows = await c.env.DB.prepare(
    `SELECT quote, content FROM comments
      WHERE question_id = ? AND is_ai = 1 AND status = 'published'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 3`,
  )
    .bind(questionId)
    .all<{ quote: string | null; content: string }>();

  const history = (historyRows.results ?? [])
    .reverse()
    .flatMap((row) =>
      row.quote
        ? [
            { role: 'user' as const, content: row.quote },
            { role: 'assistant' as const, content: row.content },
          ]
        : [],
    );

  const systemPrompt = [
    '你是一位资深前端面试官。下面是一道题库里的题目，请结合它回答用户的问题。',
    '回答用中文，先给结论再给要点，必要时附代码片段；不要复述题目原文。',
    '',
    `【标题】${question.title}`,
    `【内容】${truncate(question.content, MAX_CONTEXT)}`,
    `【解析】${truncate(question.analysis, MAX_CONTEXT)}`,
  ].join('\n');

  let aiStream: ReadableStream<Uint8Array>;
  try {
    aiStream = (await c.env.AI.run(MODEL as never, {
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      stream: true,
      max_tokens: 1024,
    } as never)) as unknown as ReadableStream<Uint8Array>;
  } catch (err) {
    console.error('[ai] run failed', err);
    return fail('INTERNAL', 'AI 服务暂时不可用，请稍后再试');
  }

  const encoder = new TextEncoder();
  const sse = (payload: unknown): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  void (async () => {
    const reader = aiStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              response?: string;
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const text = json.response ?? json.choices?.[0]?.delta?.content ?? '';
            if (text) await writer.write(sse({ content: text }));
          } catch {
            // 忽略解不开的块，不让整个流挂掉
          }
        }
      }
      await writer.write(sse({ done: true, used: used + 1, limit: DAILY_LIMIT }));
    } catch (err) {
      // 客户端主动断开也会走到这里，不必区分
      console.warn('[ai] stream aborted', String(err).slice(0, 120));
    } finally {
      try {
        await writer.close();
      } catch {
        // 已关闭
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
});

/**
 * AI 解答 —— POST /api/ai/complete（需登录）
 *
 * 投稿页用：用户只写标题 → 让模型补「正文」和「解析」，前端填进对应输入框。
 * 与 /ask 共用同一份每日额度（每人 20 次）。
 */
aiRoute.post('/complete', requireAuth, async (c) => {
  const user = currentUser(c);
  if (!user) return fail('UNAUTHORIZED', '请先登录');

  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = aiCompleteSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const { title, category } = parsed.data;

  const day = todayUtc();
  const usage = await c.env.DB.prepare('SELECT calls FROM ai_usage WHERE day = ? AND user_id = ?')
    .bind(day, user.id)
    .first<{ calls: number }>();
  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return fail('RATE_LIMITED', `今天的 AI 使用次数已用完（每人每天 ${DAILY_LIMIT} 次）`, [
      `${DAILY_LIMIT}/day`,
    ]);
  }

  await c.env.DB.prepare(
    `INSERT INTO ai_usage (day, user_id, calls) VALUES (?, ?, 1)
     ON CONFLICT(day, user_id) DO UPDATE SET calls = calls + 1`,
  )
    .bind(day, user.id)
    .run();

  const prompt = [
    '你是一位资深前端面试官。用户给出一道题的标题，请补全它。',
    category ? `分类：${category}` : '',
    `标题：${title}`,
    '',
    '要求：',
    '1. content：题目描述/考察场景，100-300 字，交代清楚问什么、有什么约束。',
    '2. analysis：详细解析，400-1000 字，先结论再分点，必要时给简短代码示例（Markdown）。',
    '3. 只输出 JSON，不要解释文字，不要 Markdown 代码块包裹。格式：',
    '{"content":"...","analysis":"..."}',
  ]
    .filter(Boolean)
    .join('\n');

  let raw = '';
  try {
    const result = (await c.env.AI.run(MODEL as never, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2400,
    } as never)) as { response?: unknown };
    // response 可能是 string，也可能是对象/数组（不同模型/版本不一样）
    const value = result?.response;
    raw = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  } catch (err) {
    console.error('[ai.complete] run failed', err);
    return fail('INTERNAL', 'AI 服务暂时不可用，请稍后再试');
  }

  const data = extractJsonObject(raw, 'analysis');
  const content = typeof data?.content === 'string' ? data.content.trim() : '';
  const analysis = typeof data?.analysis === 'string' ? data.analysis.trim() : '';

  if (!content || !analysis) {
    console.error('[ai.complete] parse failed', raw.slice(0, 200));
    return fail('INTERNAL', 'AI 返回的内容没能解析，请重试一次');
  }

  return ok({
    content: content.slice(0, 20000),
    analysis: analysis.slice(0, 20000),
    used: used + 1,
    limit: DAILY_LIMIT,
  });
});