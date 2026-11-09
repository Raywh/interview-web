# interview-web

前端面试题库 —— Vue 3 + Cloudflare Workers + D1，单 Worker 同源部署。

线上：**https://interview.2256896349.workers.dev**

---

## 现在有什么

| 能力 | 状态 |
|---|---|
| 题目列表 / 分类筛选 / 关键词搜索 / 分页 | ✅ |
| 详情：Markdown 渲染、代码高亮、一键复制 | ✅ |
| 投稿（登录后） | ✅ |
| 评论（登录后，需审核） | ✅ |
| 人工审核台：按风险分组、展示门禁原因、批量通过、下架 | ✅ |
| 个人中心：我的投稿 / 我的评论 / 拒绝原因 | ✅ |
| GitHub 登录 | ✅ |
| 邮箱登录 | ⏸ 待域名（代码已写，`AUTH_EMAIL_ENABLED=false`） |
| AI 追问 / AI 每日生成 | ⬜ 未实现 |
| 图片上传（R2） | ⬜ 未实现 |

内容门禁沿用 review-gate 的风险分级模型：`tiers + always_human + content_escalators + rounds`，
配置在 `moderation.config.json`，判定逻辑在 `api/src/moderation/gate.ts`。

---

## 目录

```
api/src/
  index.ts            路由挂载（只在这里加 app.route）
  types.ts            契约类型
  db/schema.sql       D1 表结构
  routes/             questions / comments / admin / me / auth / stats / logs
  auth/               jwt / middleware / github / email / users
  moderation/gate.ts  内容门禁
  lib/                response / validate / db 映射 / id
web/src/
  views/              Home / Detail / Add / Login / Me / Admin
  components/         Ui* + CodeBlock + CategoryMark + AppHeader
  api/                client / endpoints / types
  lib/                highlight / markdown / parseAnswer（自小程序移植）
docs/
  api.md              接口契约（权威）
  components.md       组件契约
scripts/import.mjs    题库导入
import/seed.sql       导入产物（gitignore）
backups/              D1 导出（gitignore）
```

---

## 本地开发

```bash
npm install

# 终端 1：Worker（本地 D1 由 miniflare 模拟）
npm run dev:api          # http://127.0.0.1:8787

# 终端 2（可选）：Vite 前端，/api 已代理到 8787
npm run dev:web          # http://127.0.0.1:5173
```

> 8787 会同时托管 `web/dist` 与 `/api/*`。改了前端并 `npm run build` 后，
> **必须重启 `dev:api`** 才会加载新的 assets manifest，否则静态资源 404/白屏。

首次初始化本地库：

```bash
npx wrangler d1 execute interview --local --file=./api/src/db/schema.sql
node scripts/import.mjs
npx wrangler d1 execute interview --local --file=./import/seed.sql
```

本地覆盖配置放 `.dev.vars`（已 gitignore）：

```toml
APP_ORIGIN = "http://127.0.0.1:8787"
JWT_SECRET = "local-dev-secret-do-not-deploy-0123456789"
GITHUB_CLIENT_ID = "Ov23li..."
# GITHUB_CLIENT_SECRET 本地可不配：登录回调会失败，属预期
```

---

## 部署

```bash
npx wrangler login
npx wrangler d1 create interview          # 首次；把 database_id 填进 wrangler.toml
npm run build
npx wrangler d1 execute interview --remote --file=./api/src/db/schema.sql
npx wrangler d1 execute interview --remote --file=./import/seed.sql
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

### 密钥与环境变量

| 名称 | 位置 | 说明 |
|---|---|---|
| `JWT_SECRET` | secret | 会话签名，**必须**；缺失时本地会退回 dev 密钥并告警 |
| `GITHUB_CLIENT_SECRET` | secret | GitHub OAuth |
| `GITHUB_CLIENT_ID` | `wrangler.toml [vars]` | 公开信息 |
| `APP_ORIGIN` | `wrangler.toml [vars]` | 生产域名，登录回跳用 |
| `AUTH_EMAIL_ENABLED` | `wrangler.toml [vars]` | 邮箱登录开关，默认 false |

> `wrangler secret put` 的交互是「先问名字（若命令行没带）再问值」。
> 只粘贴值，别把 secret 当名字粘进去。

### 回滚

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```

---

## 备份与恢复

D1 数据只存在 Cloudflare，**必须定期导出**：

```bash
# 导出（生成 backups/interview-<时间戳>.sql，已 gitignore）
npx wrangler d1 export interview --remote --output=backups/interview-20261106.sql

# 恢复（谨慎：会在目标库执行 DROP/CREATE）
npx wrangler d1 execute interview --remote --file=backups/interview-20261106.sql
```

建议：每次 schema 变更前、每次批量导入前各导一次。

---

## 测试与检查

```bash
npx tsc --noEmit -p api/tsconfig.json     # 后端类型
node --test test/*.test.ts                # 38 个用例：门禁分级 / 认证 / 路由
npm run build                             # 前端 vue-tsc + vite
```

---

## 已知限制

- 详情页日期块已改为分类色标：历史 144 题的 `createTime` 完全相同，日期无信息量
- 搜索是服务端 `LIKE`（144 条够用，上千条需要换 FTS）
- 「我的投稿」最多展示 50 条（分页未接到 UI）
- 微信内打开 `workers.dev` 可能被拦，未备案域名无解
- AI 与图片上传未实现
