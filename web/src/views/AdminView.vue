<script setup lang="ts">
/**
 * 审核台（docs/api.md §3，仅 admin）
 *  - 顶部统计：待审题 N / 待审评论 M / 今日通过（来自 GET /api/admin/stats）
 *  - 队列：GET /api/admin/queue 一次取全部，前端按 riskTier 分组（high → medium → low）
 *  - 每条必须显著展示 gateReasons（审核员判断的核心依据，§3 / §8.2）
 *  - 操作：通过 / 拒绝（拒绝必须填理由，服务端 zod 强校验）
 *  - 非 admin：页面内显示「无权访问」，不留空白
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import UiChip from '../components/UiChip.vue';
import UiEmpty from '../components/UiEmpty.vue';
import { ApiError } from '../api/client';
import { generateQuestion, getAdminQueue, getAdminStats, review } from '../api/endpoints';
import type { AdminStats, QueueItem } from '../api/endpoints';
import type { Tier } from '../api/types';
import { formatDateTime } from '../lib/format';
import { useAuthStore } from '../stores/auth';

const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low'];

const TIER_LABEL: Record<Tier, string> = {
  high: '高风险',
  medium: '中等风险',
  low: '低风险',
};

const TIER_DESC: Record<Tier, string> = {
  high: '含联系方式 / 图片，或代码块 + 外链等组合，优先处理',
  medium: '含外链、代码块或超长正文',
  low: '普通投稿，按提交顺序处理',
};

const auth = useAuthStore();
const router = useRouter();

const items = ref<QueueItem[]>([]);
const stats = ref<AdminStats | null>(null);
const loading = ref(true);
const loadError = ref('');
const actionError = ref('');
const feedback = ref('');

const submittingId = ref('');
/** AI 出题：分类选择 + 运行状态 */
const GEN_CATEGORIES = ['Vue', 'React', 'HTML', 'CSS', 'JS', 'Node.js', '工程化'] as const;
const genCategory = ref<string>('Vue');
const generating = ref(false);

async function runGenerate(): Promise<void> {
  if (generating.value) return;
  generating.value = true;
  actionError.value = '';
  feedback.value = '';
  try {
    const created = await generateQuestion(genCategory.value);
    feedback.value = `已生成并发布：${created.title}`;
    await load();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '生成失败，请稍后再试';
  } finally {
    generating.value = false;
  }
}
/** 批量通过：选中的条目 key（`kind:id`） */
const selected = ref<Set<string>>(new Set());
const batchRunning = ref(false);
const rejectingId = ref('');
const rejectReason = ref('');
const rejectError = ref('');

const groups = computed(() =>
  TIER_ORDER.map((tier) => ({
    tier,
    label: TIER_LABEL[tier],
    desc: TIER_DESC[tier],
    items: items.value.filter((item) => item.riskTier === tier),
  })).filter((group) => group.items.length > 0),
);

/** 访问统计（docs/api.md §14）：老服务端没有 pv 字段时按空处理，不让页面崩 */
const pv = computed(() => stats.value?.pv ?? null);
const pvTopPaths = computed(() => pv.value?.topPaths ?? []);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const [queue, statsData] = await Promise.all([getAdminQueue(), getAdminStats()]);
    items.value = queue.items;
    stats.value = statsData;
  } catch (err) {
    loadError.value =
      err instanceof ApiError ? err.message : '加载审核队列失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

async function refreshStats(): Promise<void> {
  try {
    stats.value = await getAdminStats();
  } catch {
    // 统计失败不影响队列操作，保留上一次数字
  }
}

function removeItem(id: string): void {
  items.value = items.value.filter((item) => item.id !== id);
}

function labelOf(item: QueueItem): string {
  return item.kind === 'question' ? item.title : item.content.slice(0, 24);
}

function handleActionError(err: unknown, item: QueueItem): void {
  if (err instanceof ApiError && err.code === 'CONFLICT') {
    // 已被别的审核员处理 / 已达轮次上限：从队列移除并说明，避免反复点
    removeItem(item.id);
    feedback.value = '该条目已被审核过，已从队列移除。';
    return;
  }
  actionError.value = err instanceof Error ? err.message : '操作失败，请稍后重试';
}

function itemKey(item: QueueItem): string {
  return `${item.kind}:${item.id}`;
}

function isSelected(item: QueueItem): boolean {
  return selected.value.has(itemKey(item));
}

function toggleSelect(item: QueueItem): void {
  const next = new Set(selected.value);
  const key = itemKey(item);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selected.value = next;
}

function clearSelection(): void {
  selected.value = new Set();
}

function toggleAll(): void {
  if (selected.value.size === items.value.length) {
    selected.value = new Set();
    return;
  }
  selected.value = new Set(items.value.map(itemKey));
}

/** 批量通过：逐条串行调用，单条失败不影响其它；409 视为已处理过 */
async function batchApprove(): Promise<void> {
  if (batchRunning.value || selected.value.size === 0) return;

  batchRunning.value = true;
  actionError.value = '';
  feedback.value = '';

  const targets = items.value.filter((item) => selected.value.has(itemKey(item)));
  let passed = 0;
  let failed = 0;

  for (const item of targets) {
    try {
      await review({ type: item.kind, id: item.id, action: 'approve' });
      removeItem(item.id);
      passed += 1;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        removeItem(item.id);
      } else {
        failed += 1;
      }
    }
  }

  selected.value = new Set();
  batchRunning.value = false;
  feedback.value = `批量通过 ${passed} 条${failed ? `，${failed} 条失败` : ''}`;
  await refreshStats();
}

async function approve(item: QueueItem): Promise<void> {
  if (submittingId.value) return;
  actionError.value = '';
  feedback.value = '';
  submittingId.value = item.id;
  try {
    await review({ type: item.kind, id: item.id, action: 'approve' });
    removeItem(item.id);
    feedback.value = `已通过：${labelOf(item)}`;
    await refreshStats();
  } catch (err) {
    handleActionError(err, item);
  } finally {
    submittingId.value = '';
  }
}

function startReject(item: QueueItem): void {
  rejectingId.value = item.id;
  rejectReason.value = '';
  rejectError.value = '';
  actionError.value = '';
  feedback.value = '';
}

function cancelReject(): void {
  rejectingId.value = '';
  rejectReason.value = '';
  rejectError.value = '';
}

async function confirmReject(item: QueueItem): Promise<void> {
  if (submittingId.value) return;

  const reason = rejectReason.value.trim();
  if (!reason) {
    rejectError.value = '拒绝必须填写理由';
    return;
  }
  if (reason.length > 500) {
    rejectError.value = `理由最多 500 字（当前 ${reason.length}）`;
    return;
  }

  rejectError.value = '';
  actionError.value = '';
  submittingId.value = item.id;
  try {
    await review({ type: item.kind, id: item.id, action: 'reject', reason });
    removeItem(item.id);
    feedback.value = `已拒绝：${labelOf(item)}`;
    cancelReject();
    await refreshStats();
  } catch (err) {
    handleActionError(err, item);
  } finally {
    submittingId.value = '';
  }
}

function goHome(): void {
  void router.push({ name: 'home' });
}

onMounted(() => {
  // 非 admin 不发请求：直接渲染无权访问（避免拿 403 去猜）
  if (auth.isAdmin) void load();
  else loading.value = false;
});
</script>

<template>
  <div class="admin">
    <!-- 非管理员：明确的无权态，而不是空白 -->
    <template v-if="!auth.isAdmin">
      <UiEmpty icon="🔒" text="无权访问" />
      <div class="admin-denied">
        <p class="admin-denied__desc">
          审核台仅限管理员。当前账号{{ auth.user ? `「${auth.user.name}」` : '' }}没有审核权限。
        </p>
        <UiButton variant="ghost" @click="goHome">返回题库</UiButton>
      </div>
    </template>

    <template v-else>
      <section class="admin-hero">
        <p class="eyebrow">管理 · 审核台</p>
        <h1 class="admin-title">待审<span class="admin-title__accent">队列</span></h1>
        <p class="admin-desc">
          按风险等级排序，高风险排在最前。每条都会列出投稿时门禁命中的原因，
          这是判断的主要依据。
        </p>
        <p class="admin-links">
          <RouterLink class="admin-link" :to="{ name: 'admin-questions' }">题库管理 →</RouterLink>
        </p>
      </section>

      <div class="admin-stats" aria-label="审核统计">
        <div class="admin-stat">
          <span class="admin-stat__num">{{ stats ? stats.queue.questions : '—' }}</span>
          <span class="admin-stat__label">待审题</span>
        </div>
        <div class="admin-stat">
          <span class="admin-stat__num">{{ stats ? stats.queue.comments : '—' }}</span>
          <span class="admin-stat__label">待审评论</span>
        </div>
        <div class="admin-stat">
          <span class="admin-stat__num">{{ stats ? stats.today.published : '—' }}</span>
          <span class="admin-stat__label">今日通过</span>
        </div>
        <div class="admin-stat" :class="{ 'admin-stat--warn': (stats?.flagged ?? 0) > 0 }">
          <span class="admin-stat__num">{{ stats ? (stats.flagged ?? 0) : '—' }}</span>
          <span class="admin-stat__label">AI 需留意</span>
        </div>
      </div>

      <!-- 访问统计：GET /api/admin/stats 的 pv 字段，UTC 日切分 -->
      <section class="pv" aria-label="访问统计">
        <div class="pv__head">
          <h2 class="pv__title">访问</h2>
          <span class="pv__hint">UTC 日切分 · 近 7 天</span>
        </div>
        <div class="pv__nums">
          <div class="pv__num">
            <span class="pv__value">{{ pv ? pv.today : '—' }}</span>
            <span class="pv__label">今日 PV</span>
          </div>
          <div class="pv__num">
            <span class="pv__value">{{ pv ? pv.last7 : '—' }}</span>
            <span class="pv__label">7 日 PV</span>
          </div>
        </div>
        <ol v-if="pvTopPaths.length" class="pv__top">
          <li v-for="entry in pvTopPaths" :key="entry.path" class="pv__top-item">
            <code class="pv__path">{{ entry.path }}</code>
            <span class="pv__count">{{ entry.count }}</span>
          </li>
        </ol>
        <p v-else class="pv__empty">近 7 天暂无访问记录</p>
      </section>

      <div class="ai-gen">
        <span class="ai-gen__label">AI 出题</span>
        <select v-model="genCategory" class="ai-gen__select" :disabled="generating">
          <option v-for="c in GEN_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <UiButton size="md" :disabled="generating" @click="runGenerate">
          {{ generating ? '生成中…' : '生成一道' }}
        </UiButton>
        <span class="ai-gen__hint">每天 03:00 UTC 也会自动生成 5 道</span>
      </div>

      <div v-if="items.length" class="batch-bar">
        <label class="batch-bar__all">
          <input
            type="checkbox"
            :checked="selected.size === items.length && items.length > 0"
            @change="toggleAll"
          />
          <span>全选</span>
        </label>
        <span class="batch-bar__count">已选 {{ selected.size }} 条</span>
        <UiButton size="md" :disabled="selected.size === 0 || batchRunning" @click="batchApprove">
          {{ batchRunning ? '处理中…' : '批量通过' }}
        </UiButton>
        <button
          v-if="selected.size > 0"
          type="button"
          class="batch-bar__clear"
          @click="clearSelection"
        >
          清空选择
        </button>
      </div>

      <p v-if="feedback" class="admin-feedback" role="status">✓ {{ feedback }}</p>
      <p v-if="actionError" class="admin-alert" role="alert">{{ actionError }}</p>

      <div v-if="loading" class="admin-skeleton" role="status" aria-label="正在加载审核队列">
        <div v-for="n in 3" :key="n" class="skeleton-card" aria-hidden="true">
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-line--xs"></div>
            <div class="skeleton-line skeleton-line--title"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line skeleton-line--short"></div>
          </div>
        </div>
      </div>

      <div v-else-if="loadError" class="admin-state" role="alert">
        <UiEmpty icon="⚠️" :text="loadError" />
        <UiButton variant="ghost" @click="load">重新加载</UiButton>
      </div>

      <div v-else-if="groups.length === 0" class="admin-state">
        <UiEmpty icon="✅" text="队列已清空，暂时没有待审内容" />
      </div>

      <template v-else>
        <section v-for="group in groups" :key="group.tier" class="queue-group">
          <header class="queue-group__head">
            <h2 class="queue-group__title">
              <span class="queue-group__tier" :class="`queue-group__tier--${group.tier}`">
                {{ group.label }}
              </span>
              <span class="queue-group__count">{{ group.items.length }} 条</span>
            </h2>
            <p class="queue-group__desc">{{ group.desc }}</p>
          </header>

          <article
            v-for="item in group.items"
            :key="`${item.kind}-${item.id}`"
            class="queue-item"
          >
            <UiCard padding="md">
              <label class="queue-item__select">
                <input
                  type="checkbox"
                  :checked="isSelected(item)"
                  :aria-label="`选择 ${item.title}`"
                  @change="toggleSelect(item)"
                />
              </label>
              <div class="queue-item__head">
                <UiChip
                  :label="item.kind === 'question' ? '投稿' : '评论'"
                  size="sm"
                  :tappable="false"
                />
                <UiChip v-if="item.category" :label="item.category" size="sm" :tappable="false" />
                <span class="queue-item__meta">
                  {{ item.authorName }} · {{ formatDateTime(item.createdAt) }}
                </span>
              </div>

              <h3 class="queue-item__title">{{ item.title }}</h3>
              <p class="queue-item__content">{{ item.content }}</p>

              <!-- 审核员的关键依据：必须显著 -->
              <div class="gate" :class="`gate--${group.tier}`">
                <p class="gate__title">
                  <span class="gate__icon" aria-hidden="true">⚠</span>
                  风险命中（gateReasons）
                </p>
                <ul v-if="item.gateReasons.length" class="gate__list">
                  <li v-for="(reason, index) in item.gateReasons" :key="index" class="gate__item">
                    {{ reason }}
                  </li>
                </ul>
                <p v-else class="gate__empty">门禁未给出原因（历史数据或未命中规则）</p>
              </div>

              <div v-if="rejectingId === item.id" class="reject">
                <label class="reject__label" :for="`reject-${item.id}`">拒绝理由（必填）</label>
                <textarea
                  :id="`reject-${item.id}`"
                  v-model="rejectReason"
                  class="reject__input"
                  rows="2"
                  maxlength="500"
                  placeholder="例如：内容与题目无关 / 含广告链接"
                ></textarea>
                <p class="reject__foot">
                  <span v-if="rejectError" class="reject__error" role="alert">{{ rejectError }}</span>
                  <span class="reject__count">{{ rejectReason.length }} / 500</span>
                </p>
                <div class="reject__actions">
                  <UiButton variant="ghost" @click="cancelReject">取消</UiButton>
                  <UiButton :loading="submittingId === item.id" @click="confirmReject(item)">
                    确认拒绝
                  </UiButton>
                </div>
              </div>

              <div v-else class="queue-item__actions">
                <UiButton
                  :loading="submittingId === item.id"
                  :disabled="Boolean(submittingId)"
                  @click="approve(item)"
                >
                  通过
                </UiButton>
                <UiButton
                  variant="ghost"
                  :disabled="Boolean(submittingId)"
                  @click="startReject(item)"
                >
                  拒绝
                </UiButton>
              </div>
            </UiCard>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.admin {
  padding-bottom: var(--space-6);
}

/* ---- 无权访问 ---- */
.admin-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-top: calc(var(--space-5) * -1);
  padding-bottom: var(--space-6);
  text-align: center;
}

.admin-denied__desc {
  max-width: calc(var(--rpx) * 520);
  color: var(--color-text-3);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

/* ---- Hero ---- */
.admin-hero {
  padding: var(--space-4) 0 var(--space-4);
  animation: ui-rise-in 0.5s var(--ease-out) backwards;
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: var(--eyebrow-size);
  letter-spacing: 0.26em;
  line-height: 1.4;
}

.admin-title {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: 1.2;
  letter-spacing: calc(var(--rpx) * 1);
}

.admin-title__accent {
  color: var(--color-primary);
  font-weight: var(--accent-weight);
}

.admin-desc {
  max-width: calc(var(--rpx) * 560);
  margin-top: var(--space-2);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

/* ---- 统计 ---- */
.admin-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  padding: var(--space-3) 0 var(--space-4);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.admin-stat {
  display: flex;
  flex-direction: column;
}

.admin-stat__num {
  color: var(--color-text-1);
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.admin-stat__label {
  margin-top: calc(var(--rpx) * 4);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

/* ---- 访问统计（§14） ---- */
.pv {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.pv__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.pv__title {
  color: var(--color-text-1);
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 700;
}

.pv__hint {
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

.pv__nums {
  display: flex;
  gap: var(--space-6);
}

.pv__num {
  display: flex;
  flex-direction: column;
}

.pv__value {
  color: var(--color-text-1);
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.pv__label {
  margin-top: calc(var(--rpx) * 4);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

.pv__top {
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.pv__top-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: calc(var(--rpx) * 4) 0;
  font-size: var(--text-sm);
}

.pv__path {
  color: var(--color-text-2);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.pv__count {
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
}

.pv__empty {
  margin-top: var(--space-2);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

/* ---- 反馈 ---- */
.admin-feedback {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-soft);
  border-left: 3px solid var(--color-success);
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  font-size: var(--text-sm);
}

.admin-alert {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-soft);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.admin-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.admin-skeleton {
  margin-top: var(--space-4);
}

/* ---- 分组 ---- */
.queue-group {
  margin-top: var(--space-5);
}

.queue-group__head {
  margin-bottom: var(--space-3);
}

.queue-group__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-1);
}

.queue-group__tier--high {
  color: var(--color-danger);
}

.queue-group__tier--medium {
  color: var(--color-primary);
}

.queue-group__tier--low {
  color: var(--color-text-2);
}

.queue-group__count {
  color: var(--color-text-3);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 400;
}

.queue-group__desc {
  margin-top: calc(var(--rpx) * 4);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

/* ---- 条目 ---- */
.queue-item {
  margin-bottom: var(--card-gap);
}

.queue-item__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.queue-item__meta {
  margin-left: auto;
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

.queue-item__title {
  margin-top: var(--space-2);
  color: var(--color-text-1);
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: var(--leading-tight);
}

.queue-item__content {
  margin-top: var(--space-2);
  max-height: calc(var(--rpx) * 420);
  overflow: auto;
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---- gateReasons（核心信息，必须醒目） ---- */
.gate {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-sm);
}

.gate--high {
  border-left-color: var(--color-danger);
}

.gate--low {
  border-left-color: var(--color-success);
}

.gate__title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-1);
  font-size: var(--text-sm);
  font-weight: 700;
}

.gate__icon {
  color: var(--color-danger);
  line-height: 1;
}

.gate--medium .gate__icon {
  color: var(--color-primary);
}

.gate--low .gate__icon {
  color: var(--color-success);
}

.gate__list {
  margin-top: var(--space-1);
  padding-left: var(--space-3);
  list-style: disc;
}

.gate__item {
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.gate__empty {
  margin-top: var(--space-1);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

/* ---- 操作 ---- */
.queue-item__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.reject {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.reject__label {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  font-weight: 600;
}

.reject__input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-1);
  font-family: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  resize: vertical;
}

.reject__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
  outline: none;
}

.reject__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.reject__error {
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.reject__count {
  margin-left: auto;
  color: var(--color-text-3);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.reject__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

/* ---- 批量操作 ---- */
.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.batch-bar__all {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-2);
  cursor: pointer;
}

.batch-bar__count {
  font-size: var(--text-sm);
  color: var(--color-text-3);
  margin-right: auto;
}

.batch-bar__clear {
  background: none;
  border: 0;
  color: var(--color-text-3);
  font-size: var(--text-sm);
  cursor: pointer;
  text-decoration: underline;
}

.queue-item__select {
  display: block;
  margin-bottom: var(--space-2);
}

.admin-stat--warn .admin-stat__num {
  color: var(--color-danger);
}

.admin-stat--warn .admin-stat__label {
  color: var(--color-danger);
}

/* ---- AI 出题 ---- */
.ai-gen {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

.ai-gen__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-2);
}

.ai-gen__select {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-1);
  font-size: var(--text-sm);
}

.ai-gen__hint {
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.admin-links {
  margin: var(--space-2) 0 0;
}

.admin-link {
  color: var(--color-primary);
  font-size: var(--text-sm);
  text-decoration: none;
  border-bottom: 1px solid currentColor;
}
</style>
