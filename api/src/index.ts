import { Hono } from 'hono';
import { DAILY_CATEGORIES, generateQuestion } from './ai/generate';
import type { Env } from './types';

/**
 * A0 独占文件。
 * 其它 agent 不要修改本文件——新增路由请写在自己的 routes/*.ts 里，
 * 然后把「挂载行」提给 A0，由 A0 统一合并，避免多 agent 冲突。
 *
 * 路由清单见 docs/api.md。当前只实现了 /api/health，
 * 其余挂载点保持注释状态，按里程碑逐步打开。
 */
const app = new Hono<{ Bindings: Env }>();

// ── 健康检查（A0 实现，用于部署后冒烟）────────────────
// 顺带验证 D1 绑定是否可用：smoke 时 db 必须是 "ok"
app.get('/api/health', async (c) => {
  let db: 'ok' | 'down' = 'down';
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    db = 'ok';
  } catch (err) {
    console.error('[health.db]', err);
  }
  return c.json({ ok: true, data: { status: 'up', db, ts: Date.now() } });
});

// ── 挂载点（按顺序打开，每次只加一行）──────────────────
import { meRoute } from './routes/me';
import { aiRoute } from './routes/ai';
import { filesRoute } from './routes/files';
app.route('/api/me', meRoute);
app.route('/api/ai', aiRoute);
app.route('/api', filesRoute);

// A3：认证路由（github / email / logout / me）
import { authRoute } from './routes/auth';
app.route('/api/auth', authRoute);

// A2：业务路由（questions / comments / admin / stats / logs）
import { questionsRoute } from './routes/questions';
import { commentsRoute } from './routes/comments';
import { adminRoute } from './routes/admin';
import { statsRoute } from './routes/stats';
import { logsRoute } from './routes/logs';

// D：访问统计（PV）
import { pvRoute } from './routes/pv';

app.route('/api/questions', questionsRoute);
// comments 的对外路径是 /api/questions/:id/comments，所以也挂在 questions 下
app.route('/api/questions', commentsRoute);
app.route('/api/admin', adminRoute);
app.route('/api/stats', statsRoute);
app.route('/api/logs', logsRoute);
app.route('/api/pv', pvRoute);

/**
 * 未匹配的请求：
 *  - /api/*      → JSON 404（run_worker_first 保证 API 一定进 Worker）
 *  - 其它路径     → 交给静态资源（SPA fallback 已在 wrangler.toml 配置）
 */
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: `未找到 ${c.req.path}` } },
      404,
    );
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error('[worker]', err);
  return c.json(
    { ok: false, error: { code: 'INTERNAL', message: '服务异常，请稍后再试' } },
    500,
  );
});

/**
 * Worker 导出：
 *  - fetch      → Hono 应用
 *  - scheduled  → 每日 03:00 UTC 自动出题（每个分类 1 道）
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        for (const category of DAILY_CATEGORIES) {
          const created = await generateQuestion(env, category);
          console.log(`[cron] ${category} → ${created ? created.title : '跳过'}`);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
