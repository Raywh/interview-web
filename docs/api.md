# API 契约 v1（冻结）

> 本文件是**唯一权威**。代码与文档冲突时以本文为准。
> 变更流程：改本文 → 改 `api/src/types.ts` → 通知 A2/A3/A4/A5。
> 共 **14 个接口**（比多 agent 规划里的「12 个」多了 `logout` 与 `admin/stats`）。

## 0. 通用约定

**响应包裹**

```jsonc
// 成功
{ "ok": true, "data": { ... } }
// 失败
{ "ok": false, "error": { "code": "VALIDATION", "message": "标题不能为空", "reasons": ["title"] } }
```

**错误码**

| code | HTTP | 含义 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未登录 / 会话过期 |
| `FORBIDDEN` | 403 | 非管理员、非作者 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION` | 400 | 参数校验失败（`reasons` 给字段名） |
| `RATE_LIMITED` | 429 | 触发限流（`reasons` 给窗口，如 `60/min`） |
| `CONFLICT` | 409 | 状态冲突（如重复审核） |
| `NOT_IMPLEMENTED` | 501 | 功能暂未开启（如关闭状态下的邮件登录） |
| `INTERNAL` | 500 | 未预期异常 |

**认证**：`sid` cookie（HttpOnly + Secure + SameSite=Lax + Path=/，7 天）。
前端 `fetch` 必须带 `credentials: 'include'`。**不用 Bearer**（同源部署，cookie 足够）。

**分页**：`page` 从 1 开始，`pageSize` 默认 20、上限 50。

---

## 1. 认证

### `GET /api/auth/github`

302 跳转 GitHub 授权页。`state` 为 5 分钟有效的签名 JWT（防 CSRF），无需会话。

### `GET /api/auth/github/callback?code=&state=`

校验 `state` → 换 token → 拉用户 → upsert → 下发 `sid` → 302 到 `APP_ORIGIN`。
失败时 302 到 `/?login=error&reason=<code>`。

### `POST /api/auth/logout`

清 cookie。返回 `{ ok: true, data: { loggedOut: true } }`。

### `GET /api/auth/me`

```jsonc
{ "ok": true, "data": { "id": "u_...", "name": "王虎", "email": null, "avatarUrl": "https://...", "role": "user", "createdAt": 1762... } }
```

未登录 → 401 `UNAUTHORIZED`。

### `POST /api/auth/email/start` · `POST /api/auth/email/verify`

**当前返回 501**（`AUTH_EMAIL_ENABLED=false`）。实现已写好，有域名后打开开关即可。

---

## 2. 题目

### `GET /api/questions`

查询：`category`（可选，精确匹配）、`page`、`pageSize`。

```jsonc
{
  "ok": true,
  "data": {
    "items": [{
      "id": "q_01H...", "title": "...", "excerpt": "前 120 字…",
      "category": "Vue", "isAi": true, "status": "published",
      "riskTier": "low", "authorId": null, "createdAt": 1762...
    }],
    "total": 144, "page": 1, "pageSize": 20, "hasMore": true
  }
}
```

规则：只返回 `status='published'`；`excerpt` 由 `content` 截断 120 字生成。

**排序（重要）**：`ORDER BY created_at DESC, rowid ASC`。
原因：导入的 144 条历史数据 `createTime` **全部是同一个时间戳**（`2026-08-15T05:25:38.267Z`），只按 `created_at` 排序结果不稳定。用 `rowid` 做二级键可保持导入顺序（即源文件的分类顺序）。新建投稿的 `created_at` 各不相同，不受影响。

### `GET /api/questions/:id`

返回完整 `Question`（含 `content` / `analysis`）。

- `published` → 任何人可读，并 `views += 1`
- `pending` / `rejected` → 仅作者本人或 admin
- `hidden` → 仅 admin
- 其余 → 404

### `POST /api/questions`（需登录）

```jsonc
// 请求
{ "title": "…", "content": "…", "analysis": "…", "category": "Vue" }
// 响应
{ "ok": true, "data": { "id": "q_...", "status": "pending", "gate": { "tier": "medium", "approvals": 1, "decision": "needs-human", "reasons": ["含外链"], "hits": [{"id":"extlink","why":"外链"}] } } }
```

校验：`title` 1–200 字；`content` / `analysis` 1–20000 字；`category` 必须命中白名单。

**入库一定是 `pending`**，除非门禁判定 `decision='auto-publish'`（当前配置下不会发生，因为全人工）。

### `GET /api/questions/:id/comments`

返回 `Page<Comment>`，只含 `published`，按 `created_at DESC`。

### `POST /api/questions/:id/comments`（需登录）

```jsonc
{ "content": "…" }   // 1–500 字
```

同样过门禁，入库 `pending`。限流：**每用户 60 秒 3 条**，超限 429。

### `GET /api/stats`

```jsonc
{ "ok": true, "data": { "total": 144, "categories": [{"name":"Vue","count":0},{"name":"TypeScript与类型系统","count":20}] } }
```

只统计 `published`。

### `POST /api/logs`

```jsonc
{ "level": "error", "tag": "detail.fetch", "message": "…", "meta": { "…": "…" }, "path": "/q/123" }
```

无需登录。限流：**每 IP 60 秒 20 条**。`meta` 服务端截断 4KB，`message` 截断 2KB。

---

## 3. 管理### `GET /api/admin/queue?type=questions|comments&tier=high|medium|low`

需 `role='admin'`。按 `risk_tier`（high 优先）→ `created_at ASC` 排序。

```jsonc
{ "ok": true, "data": { "items": [{ "id": "...", "kind": "question", "title": "…", "content": "…", "category": "…", "riskTier": "high", "gateReasons": ["含手机号"], "authorName": "…", "createdAt": 1762... }], "total": 7 } }
```

`gateReasons` 是投稿时门禁算出的原因，**审核台必须展示**——这是 review-gate 的核心设计。

### `POST /api/admin/review`

```jsonc
// 通过
{ "type": "question", "id": "q_...", "action": "approve" }
// 拒绝
{ "type": "comment", "id": "c_...", "action": "reject", "reason": "广告" }
```

规则：

- `approve` → `status='published'`
- `reject` → `status='rejected'` + `reject_reason`，并 `review_round += 1`
- `review_round > 3` 时拒绝提交（409 `CONFLICT`，提示 24h 冷却）

### `GET /api/admin/stats`

```jsonc
{ "ok": true, "data": { "queue": { "questions": 3, "comments": 7 }, "today": { "published": 12, "rejected": 2 }, "ai": { "neurons": 0 } } }
```

`ai` 二期接入，现在恒为 0。

---

## 4. 门禁约定（给 A3）

投稿/评论写入前调用 `evaluate(content)`，返回 `GateResult`：

| 字段 | 用途 |
|---|---|
| `tier` | 写 `risk_tier` 列，决定队列排序 |
| `approvals` | 0 = 自动发布；≥1 = 人工 |
| `decision` | `auto-publish` / `needs-human` |
| `reasons` | 给人看的解释，如「含外链」「命中手机号」 |
| `hits` | 命中的规则 id + 原因，存 `logs` 便于回溯 |

配置见仓库根 `moderation.config.json`。

---

## 5. 状态机

```
        投稿                审核通过
  ──────────────► pending ──────────► published
                     │
                     │ 审核拒绝（reason）
                     ▼
                  rejected ──(作者修改后重投)──► pending
                     │
                     └─ review_round > 3 → 拒绝 + 24h 冷却
```

`hidden` 只有 admin 能设置（用于下架不当内容；导入的历史题默认全部 `published`）。

---

## 6. 限流一览

| 动作 | 键 | 窗口 | 上限 |
|---|---|---|---|
| 评论 | `comment:u:<userId>` | 60s | 3 |
| 投稿 | `question:u:<userId>` | 1h | 10 |
| 日志上报 | `log:ip:<ipHash>` | 60s | 20 |
| 登录回调 | `auth:ip:<ipHash>` | 10min | 20 |

实现：`rate_limits` 表 + `INSERT ... ON CONFLICT DO UPDATE`，过期行由 Cron 清理（二期）。

---

## 7. 系统接口

### `GET /api/health`（无需登录）

部署后冒烟用。`db` 必须为 `ok`，否则说明 D1 绑定没通。

```jsonc
{ "ok": true, "data": { "status": "up", "db": "ok", "ts": 1793889668614 } }
```
> 当前实现会真的执行一次 `SELECT 1` 来验证 D1，失败时 `db: "down"` 并打日志。

---

## 8. 契约补充（A2 交付后裁决，2026-11-05）

A2 提出的 8 处不确定，逐条定稿如下。**以本节为准**。

### 8.1 分类白名单（13 项，含 Vue 与 React）

```
Vue / React / 工程化 / CSS / JS / TypeScript与类型系统 / 流式处理与实时通信 /
前端状态管理与数据流 / 性能优化与渲染 / 前端AI架构设计 /
AI特性与前端工程实践 / AI工程化与前端工具链 / 大模型前端集成
```

- **含 Vue 与 React 两类**。2026-11-05 更正：此前「只要 Vue 不要 React」的说法有误，题库两者都要
- 导入的 144 条**全部 `published`**，原「标题含 react → hidden」的规则已从 `import.mjs` 移除；隐藏的 5 条已恢复
- 源数据里 Vue / React 两个分类目前**都是 0 条**（144 条属于另外 8 个分类），位置保留，等补导或二期 AI 生成
- 列表筛选**不做白名单限制**（精确匹配即可，空串视为不筛选）；只有**投稿**校验白名单

### 8.2 gateReasons 的存储（表结构已补）

审核台要展示「为什么被判 high」，原来没有列可存。已加：

```sql
ALTER TABLE questions ADD COLUMN gate_reasons TEXT;  -- JSON 数组字符串
ALTER TABLE comments  ADD COLUMN gate_reasons TEXT;
```

迁移文件：`api/src/db/migrations/001_add_gate_reasons.sql`（新库由 schema.sql 直接建出）。
写入方是 A3 的门禁（投稿/评论时落库），读取方是 `GET /api/admin/queue`（解析失败返回 `[]`，不抛错）。

### 8.3 未定义响应形状的接口（定稿）

| 接口 | 响应 `data` |
|---|---|
| `POST /api/admin/review` | `{ "id": "q_…", "type": "question", "status": "published" }` |
| `POST /api/questions/:id/comments` | `{ "id": "c_…", "status": "pending" }` |
| `POST /api/logs` | `{ "logged": true }` |

### 8.4 边界行为（定稿）

| 场景 | 行为 |
|---|---|
| 评论发在非 `published` 题目上 | 404 `NOT_FOUND` |
| `GET /questions/:id` 未发布 + 未登录 | **401**（不是 404，避免误导） |
| `hidden` 题目 + 非 admin | 403 `FORBIDDEN` |
| `review_round > 3` 再提交 | 409 `CONFLICT` + 24h 冷却 |
| `excerpt` | 前 120 字，**不加省略号** |
| `pageSize > 50` | 400 `VALIDATION` |
| 空 `category` | 视为不筛选 |

### 8.5 「今日」口径

UTC 日切分（Workers 无时区配置）。`questions` 用 `updated_at`，`comments` 无 `updated_at` 只能用 `created_at` 近似。**已知误差，接受**。

### 8.6 logs.meta 超长

不再裸截断（会留下非法 JSON）。超 4096 时改存：

```json
{ "_truncated": true, "_originalSize": 12345, "preview": "…前 3976 字符…" }
```

### 8.7 仍然待办

- 限流（`rate_limits` 表）——A3 或 D5 实现
- 门禁本身（`risk_tier` 目前恒 `low`、`gate_reasons` 恒空）——A3 实现
### 8.8 链接的分级口径（A3 发现的问题，已定稿）

A3 发现：`medium.match` 里有 `has:link`，同时 escalator `extlink` 的 effect 是 `raise`；按 review-gate 语义 `medium → high`，于是「带链接」永远被判 high（要 2 个批准）。

**裁决：不是引擎的问题，是配置重复计分。** 已把 `has:link` 从 `medium.match` 移除，让链接只通过 escalator 生效。原则是：

> **同一个事实不在 tiers 和 escalators 里各算一次。**
> tiers 管「内容形态」，escalators 管「形态之外的额外风险」。

定稿后的分级：

| 内容 | 基础分级 | 升级 | 最终 |
|---|---|---|---|
| 纯文本 | low（`*` 全匹配） | — | **low** |
| 纯文本 + 外链 | low | `extlink` raise | **medium** |
| 代码块 | medium | — | **medium** |
| 代码块 + 外链 | medium | `extlink` raise | **high** |
| 手机号 / 邮箱 / `<script>` / 微信 | 任意 | forced high | **high** |
| 图片 | 任意 | `always_human` | **high（双人复核）** |

验收断言（A3 的测试要覆盖）：
- 真配置：`纯文本+链接 → medium`、`代码块+链接 → high`
- 去掉 escalators 的配置副本：`纯文本+链接 → low`（证明链接确实由 escalator 提升，而不是 tiers）
### 8.9 门禁与认证的实现约定（A3 交付后定稿）

**① 评论响应的 `gate` 字段**
`POST /api/questions/:id/comments` 除 `{id,status}` 外多返回 `gate`（门禁结果）。§8.3 只定义了前两个字段，这里是**附加字段**，不破坏已有消费者。`status` 恒为 `pending`（评论不自动发布）。

**② `always_human` 命中强制 high**
review-gate 的 `always_human` 只抬 `approvals`、不改 tier；我们的实现**同时把 tier 抬到 high**。这是有意的：图片和敏感词内容在审核台上必须排在前面。偏差记录在此，不视为 bug。

**③ 信号与配置路径的别名**
配置里 `always_human.paths` 用的是 `always:image` / `always:sensitive`，而内容侧抽出来的是 `has:image` / `has:contact`，实现里有一层别名映射：

```
has:image   → always:image
has:contact → always:sensitive
```

**④ 501 的错误码**
关闭状态下的邮件登录返回 `501` + `NOT_IMPLEMENTED`（本轮新增的错误码，见 §0 表）。此前是 501 + `VALIDATION`，会让前端按 code 反查状态时对不上。

**⑤ 本地密钥兜底**
没配 `JWT_SECRET` 且不是生产时，服务用固定 dev 密钥并打一次警告。**部署前必须 `wrangler secret put JWT_SECRET`**，否则任何拿到源码的人都能伪造会话。

**⑥ 仍未实现**
限流（§6 的全部规则）、Resend 真实发信、`AUTH_EMAIL_ENABLED=true` 分支。
---

## 9. 个人中心接口（A6 新增，2026-11-06）

原先「我的投稿 / 我的评论」只能靠前端 localStorage 记录，换设备就丢。现补两个接口。

### `GET /api/me/questions`（需登录）

返回**本人**的投稿，**不受 `status` 限制**（待审、已拒绝都要能看到）。

```jsonc
{ "ok": true, "data": {
  "items": [{
    "id": "q_...", "title": "…", "excerpt": "…", "category": "Vue",
    "isAi": false, "status": "rejected", "riskTier": "low",
    "authorId": "u_...", "createdAt": 1762...,
    "rejectReason": "内容与题库重复"        // 未拒绝时为 null
  }],
  "total": 3, "page": 1, "pageSize": 20, "hasMore": false
} }
```

排序：`created_at DESC, rowid ASC`。分页参数同 §0。

### `GET /api/me/comments`（需登录）

返回**本人**的评论，同样不受 `status` 限制，附带所属题目标题。

```jsonc
{ "ok": true, "data": {
  "items": [{
    "id": "c_...", "questionId": "q_...", "userId": "u_...",
    "userName": "RAY", "content": "…", "status": "pending",
    "createdAt": 1762..., "questionTitle": "vue3 的 setup"
  }],
  "total": 1, "page": 1, "pageSize": 20, "hasMore": false
} }
```

### `reject_reason` 的可见性

`GET /api/questions/:id` 与 `/api/me/questions` 里：

| 查看者 | `rejectReason` |
|---|---|
| 作者本人 | 返回（可能为 null） |
| admin | 返回 |
| 其他人 | **不返回该字段**（不是空字符串，是整个字段不存在） |

理由：拒绝原因是给作者看的，不该出现在公开响应里。
---

## 10. 下架 / 恢复（A8 新增，2026-11-06）

个人主体做 UGC 必须有「发现违规能立刻撤下」的能力，而 `review` 只处理 `pending`。
所以单独加一个接口。

### `POST /api/admin/visibility`（需 admin）

```jsonc
// 请求
{ "type": "question", "id": "q_...", "hidden": true }
// 响应
{ "ok": true, "data": { "id": "q_...", "type": "question", "status": "hidden" } }
```

| 参数 | 说明 |
|---|---|
| `type` | `question` \| `comment` |
| `hidden` | `true` 下架 → `status='hidden'`；`false` 恢复 → `status='published'` |

行为：

- 已处于目标状态时幂等返回，不报错
- 下架后：公开列表不再返回；匿名访问详情 **401**；作者访问 **403**；管理员可读
- 入口：详情页右上角，仅 admin 可见（「下架」/「恢复上架」）
---

## 11. AI 追问（2026-11-06）

### `POST /api/ai/ask`（需登录，SSE）

```jsonc
// 请求
{ "questionId": "q_...", "message": "这道题的关键点是什么？" }

// 响应：text/event-stream
data: {"content":"闭"}
data: {"content":"包"}
data: {"done":true,"used":1,"limit":20}
```

- **每人每天 20 次**，按 UTC 日切分，计数表 `ai_usage`
- 模型 `@cf/qwen/qwen3-30b-a3b-fp8`（免费额度下约 450 次/天）
- 超额 → 429 `RATE_LIMITED`
- 前端断开 → 服务端静默收尾

## 12. AI 问答落库（2026-11-06）

### `POST /api/questions/:id/ai-comments`（需登录）

把一次 AI 问答存成一条评论，出现在讨论区。

```jsonc
// 请求
{ "question": "什么是闭包？", "answer": "闭包是函数与其词法环境的组合……" }
// 响应
{ "ok": true, "data": { "id": "c_...", "status": "published", "gate": { … } } }
```

发布策略：

| 门禁等级 | 处理 |
|---|---|
| low / medium | 直接 `published`（机器生成，风险低） |
| high | `pending`，等人工确认 |

- 归属系统用户 `u_ai_assistant`（名字「AI 助手」）
- `comments.is_ai = 1`，`comments.quote` 存用户原提问，前端渲染成引用块
- 前端入口：评论框输入以 `@AI` 开头即触发（流式拿回答后调用本接口落库）
### 8.10 script 规则的调整（2026-11-06）

原规则：正文出现 `<script` 就判 **high**。

问题：Vue 面试题几乎都会写 `<script setup>`，AI 回答因此被误判为高危（实测一条正常回答被判 high，原因就是「含脚本标签」）。

现在的规则：

```json
{ "id": "script", "pattern": "<\\s*script[^>]*>[\\s\\S]*?</\\s*script\\s*>", "effect": "raise" }
```

- 只匹配**完整闭合**的 `<script>…</script>`
- 效果从 `high` 降为 `raise`（升一级）
- `<script setup>` 这类裸标签不再命中