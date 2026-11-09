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
scripts/backup.ps1    D1 自动备份（保留 14 份，用法见 scripts/backup.md）
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

D1 数据只存在 Cloudflare，**必须定期导出**。自动化入口是 [`scripts/backup.ps1`](scripts/backup.ps1)，
用法与恢复步骤见 [`scripts/backup.md`](scripts/backup.md)。

```powershell
pwsh -File scripts/backup.ps1     # 前置：已 npx wrangler login（同一 Windows 用户）
```

- 产物：`backups/interview-yyyyMMdd-HHmmss.sql`。`backups/` 已 gitignore，**含用户邮箱等个人信息，不要提交**
- 保留策略：只留最近 **14** 份自动备份，更早的按文件名时间戳删除；手工导出的老文件（如 `interview-20261106-2251.sql`）不参与计数、不会被删
- 日志：`backups/backup.log` 每次运行一行（时间 / 文件名 / 大小 / 耗时 / 成败）；失败退出码非 0，错误摘要写进日志
- 想每天自动跑：`scripts/backup.md` 里有 `schtasks /create` 完整命令（每天 12:30，**未实际注册**）

手动导出 / 恢复（恢复是破坏性操作，执行前先读 `scripts/backup.md`）：

```bash
# 临时手动导出一份（正常情况用上面的脚本）
npx wrangler d1 export interview --remote --output=backups/interview-manual.sql

# 恢复：会用备份文件内容改写线上库，先确认文件、再先备份当前状态
npx wrangler d1 execute interview --remote --file=backups/interview-<时间戳>.sql
```

建议：每次 schema 变更前、每次批量导入前各跑一次备份。

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
