# 组件契约 v1（A0 定，A4 实现，A5 只消费）

> 规则：**props 名字和取值集合冻结**。A4 可以加内部实现细节，不能改外部接口。
> 样式一律走 `styles/tokens.css` 的 CSS 变量，禁止写死色值。

## 1. 基础组件

### `UiButton`

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `variant` | `'primary' \| 'ghost' \| 'plain'` | `'primary'` | 主色 / 描边 / 纯文字 |
| `size` | `'md' \| 'lg'` | `'md'` | |
| `block` | `boolean` | `false` | 撑满一行 |
| `loading` | `boolean` | `false` | 显示 spinner 并禁用 |
| `disabled` | `boolean` | `false` | |

事件：`@click`（loading / disabled 时不触发）

### `UiChip`

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `label` | `string` | — | 必填 |
| `active` | `boolean` | `false` | 选中态（分类筛选） |
| `size` | `'sm' \| 'md'` | `'md'` | |
| `tappable` | `boolean` | `true` | false 时只展示不可点 |

事件：`@select`（载荷为 `label`）

### `UiCard`

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | |
| `hoverable` | `boolean` | `true` | 悬停微抬升 |

插槽：默认

### `UiSection`

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `eyebrow` | `string` | — | 如「01 · 核心内容」 |
| `title` | `string` | — | |
| `accent` | `string` | — | 标题里用主色强调的那段 |
| `desc` | `string` | — | 副标题 |

插槽：默认、`extra`（右侧操作区，如「复制」按钮）

### `UiEmpty`

| prop | 类型 | 默认 |
|---|---|---|
| `icon` | `string` | `'🗂'` |
| `text` | `string` | `'暂无内容'` |

### `UiAvatar`

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `src` | `string \| null` | `null` | 无图时回退首字 |
| `name` | `string` | `''` | 取首字做占位 |
| `size` | `'sm' \| 'md'` | `'sm'` | |

### `UiDateBlock`

| prop | 类型 | 说明 |
|---|---|---|
| `date` | `string`（ISO） | 渲染成「日 + 月」两行块 |

## 2. 业务组件

### `CodeBlock`

| prop | 类型 | 说明 |
|---|---|---|
| `code` | `string` | 原始代码 |
| `lang` | `string` | 语言标签，可空 |
| `tokens` | `{text,color}[]` | **由 `lib/highlight.ts` 预先算好**，组件只负责渲染 |

行为：右上角 `lang` 标签；复制按钮调用 `navigator.clipboard`；`white-space: pre-wrap` 防横向滚动。

### `AiPanel`（二期）

| prop | 类型 | 说明 |
|---|---|---|
| `questionId` | `string` | |
| `loading` | `boolean` | |
| `answer` | `string` | 流式拼接后的正文 |
| `reasoning` | `string` | 思考链，默认折叠 |

## 3. 组件使用约定

1. **A5 不得自己写卡片的圆角/阴影**，一律 `UiCard`
2. 分类筛选只用 `UiChip`，不要另造
3. 所有色值来自 `var(--color-*)`，间距来自 `var(--space-*)`
4. 移动端基准 375px；≥ 768px 时容器 `max-width: 640px` 居中

## 4. 与小程序版的对应关系

| 小程序组件 | Web 组件 | 差异 |
|---|---|---|
| `ui-card` | `UiCard` | 无 |
| `ui-chip` | `UiChip` | 事件名从 `select` 保留 |
| `ui-button` | `UiButton` | 增加 `variant='plain'` |
| `ui-section` | `UiSection` | 保留 `extra` 插槽 |
| `ui-empty` | `UiEmpty` | 无 |
| `ui-avatar` | `UiAvatar` | 增加 `src` |
| `ui-date-block` | `UiDateBlock` | 无 |
| （内联在 detail.wxml） | `CodeBlock` | 抽出独立组件 |
