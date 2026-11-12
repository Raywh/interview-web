<script setup lang="ts">
/**
 * 题库管理（仅 admin）—— docs/api.md §17
 *
 *  - 按分类 / 状态 / 有无解析 / 关键词筛选
 *  - 勾选后批量硬删除（不可恢复，二次确认）
 *  - 与审核台不同：这里看的是**全部状态**的题，包括已发布
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiEmpty from '../components/UiEmpty.vue';
import { ApiError, getStats } from '../api/client';
import { deleteAdminQuestions, getAdminQuestions } from '../api/endpoints';
import type { AdminQuestionItem } from '../api/endpoints';
import { formatDate } from '../lib/format';
import { useAuthStore } from '../stores/auth';

defineOptions({ name: 'AdminQuestionsView' });

const auth = useAuthStore();

const STATUS_TEXT: Record<string, string> = {
  published: '已发布',
  pending: '待审',
  rejected: '已拒绝',
  hidden: '已下架',
};

const PAGE_SIZE = 20;

const items = ref<AdminQuestionItem[]>([]);
const total = ref(0);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const error = ref('');
const feedback = ref('');

const categories = ref<string[]>([]);

const filter = ref({
  category: '',
  status: '',
  hasAnalysis: '' as '' | 'yes' | 'no',
  q: '',
});

const selected = ref<Set<string>>(new Set());
const deleting = ref(false);

const allSelected = computed(
  () => items.value.length > 0 && items.value.every((item) => selected.value.has(item.id)),
);

async function loadCategories(): Promise<void> {
  try {
    const stats = await getStats();
    categories.value = stats.categories.map((item) => item.name);
  } catch {
    categories.value = [];
  }
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const data = await getAdminQuestions({
      category: filter.value.category || undefined,
      status: filter.value.status || undefined,
      q: filter.value.q.trim() || undefined,
      hasAnalysis: filter.value.hasAnalysis || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    });
    items.value = data.items;
    total.value = data.total;
    hasMore.value = data.hasMore;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function resetAndLoad(): void {
  page.value = 1;
  selected.value = new Set();
  void load();
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onKeywordInput(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    resetAndLoad();
  }, 350);
}

function toggle(id: string): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll(): void {
  selected.value = allSelected.value
    ? new Set()
    : new Set(items.value.map((item) => item.id));
}

async function removeSelected(): Promise<void> {
  if (selected.value.size === 0 || deleting.value) return;
  const ids = Array.from(selected.value);
  const ok = window.confirm(
    `确定永久删除选中的 ${ids.length} 道题吗？\n\n删除不可恢复（评论会一并删除）。`,
  );
  if (!ok) return;

  deleting.value = true;
  feedback.value = '';
  error.value = '';
  try {
    const result = await deleteAdminQuestions(ids);
    feedback.value = `已删除 ${result.deleted} 道题`;
    selected.value = new Set();
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败';
  } finally {
    deleting.value = false;
  }
}

function nextPage(): void {
  if (!hasMore.value) return;
  page.value += 1;
  selected.value = new Set();
  void load();
}

function prevPage(): void {
  if (page.value <= 1) return;
  page.value -= 1;
  selected.value = new Set();
  void load();
}

watch(
  () => [filter.value.category, filter.value.status, filter.value.hasAnalysis],
  () => resetAndLoad(),
);

onMounted(() => {
  if (!auth.isAdmin) {
    loading.value = false;
    return;
  }
  void loadCategories();
  void load();
});
</script>

<template>
  <div class="aq">
    <header class="aq-head">
      <div>
        <p class="eyebrow">管理 · 题库</p>
        <h1 class="aq-title">题库<span>管理</span></h1>
      </div>
      <RouterLink class="aq-back" :to="{ name: 'admin' }">← 返回审核台</RouterLink>
    </header>

    <template v-if="!auth.isAdmin">
      <UiEmpty icon="🔒" text="无权访问" />
    </template>

    <template v-else>
      <div class="aq-filters">
        <select v-model="filter.category" class="aq-select" aria-label="分类">
          <option value="">全部分类</option>
          <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
        </select>

        <select v-model="filter.status" class="aq-select" aria-label="状态">
          <option value="">全部状态</option>
          <option value="published">已发布</option>
          <option value="pending">待审</option>
          <option value="rejected">已拒绝</option>
          <option value="hidden">已下架</option>
        </select>

        <select v-model="filter.hasAnalysis" class="aq-select" aria-label="解析">
          <option value="">解析：不限</option>
          <option value="yes">有解析</option>
          <option value="no">无解析</option>
        </select>

        <input
          v-model="filter.q"
          class="aq-search"
          type="search"
          placeholder="搜索标题关键词…"
          @input="onKeywordInput"
        />
      </div>

      <div class="aq-bar">
        <label class="aq-all">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" />
          <span>全选本页</span>
        </label>
        <span class="aq-count">共 {{ total }} 道 · 已选 {{ selected.size }}</span>
        <UiButton size="md" :disabled="selected.size === 0 || deleting" @click="removeSelected">
          {{ deleting ? '删除中…' : '删除所选' }}
        </UiButton>
      </div>

      <p v-if="feedback" class="aq-ok">✓ {{ feedback }}</p>
      <p v-if="error" class="aq-err" role="alert">{{ error }}</p>

      <div v-if="loading" class="aq-state">加载中…</div>

      <div v-else-if="items.length === 0" class="aq-state">
        <UiEmpty icon="🗂" text="没有符合条件的题目" />
      </div>

      <ul v-else class="aq-list">
        <li v-for="item in items" :key="item.id" class="aq-item">
          <input
            type="checkbox"
            class="aq-check"
            :checked="selected.has(item.id)"
            :aria-label="`选择 ${item.title}`"
            @change="toggle(item.id)"
          />

          <div class="aq-main">
            <RouterLink class="aq-item-title" :to="{ name: 'detail', params: { id: item.id } }">
              {{ item.title }}
            </RouterLink>
            <div class="aq-meta">
              <span class="aq-tag">{{ item.category }}</span>
              <span class="aq-tag" :class="`aq-tag--${item.status}`">
                {{ STATUS_TEXT[item.status] ?? item.status }}
              </span>
              <span v-if="!item.hasAnalysis" class="aq-tag aq-tag--empty">无解析</span>
              <span v-if="item.isAi" class="aq-tag">AI 生成</span>
              <span class="aq-date">{{ formatDate(item.createdAt) }}</span>
            </div>
          </div>
        </li>
      </ul>

      <div class="aq-pager">
        <UiButton variant="ghost" size="md" :disabled="page <= 1" @click="prevPage">上一页</UiButton>
        <span class="aq-page">第 {{ page }} 页</span>
        <UiButton variant="ghost" size="md" :disabled="!hasMore" @click="nextPage">下一页</UiButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.aq {
  padding-bottom: var(--space-6);
}

.aq-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  margin: var(--space-4) 0 var(--space-4);
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  letter-spacing: var(--eyebrow-spacing);
  color: var(--color-primary);
  text-transform: uppercase;
}

.aq-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  color: var(--color-text-1);
}

.aq-title span {
  color: var(--color-primary);
}

.aq-back {
  color: var(--color-text-3);
  font-size: var(--text-sm);
  text-decoration: none;
}

.aq-filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.aq-select,
.aq-search {
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-1);
  font-size: var(--text-sm);
  font-family: inherit;
}

.aq-search {
  flex: 1;
  min-width: 180px;
}

.aq-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  margin-bottom: var(--space-3);
}

.aq-all {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-2);
  cursor: pointer;
}

.aq-count {
  margin-right: auto;
  font-size: var(--text-sm);
  color: var(--color-text-3);
}

.aq-ok {
  margin: 0 0 var(--space-2);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.aq-err {
  margin: 0 0 var(--space-2);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.aq-state {
  padding: var(--space-5) 0;
  text-align: center;
  color: var(--color-text-3);
}

.aq-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.aq-item {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.aq-check {
  margin-top: calc(var(--rpx) * 10);
}

.aq-main {
  min-width: 0;
  flex: 1;
}

.aq-item-title {
  display: block;
  color: var(--color-text-1);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  text-decoration: none;
  word-break: break-word;
}

.aq-item-title:hover {
  color: var(--color-primary);
}

.aq-meta {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  align-items: center;
  margin-top: var(--space-2);
}

.aq-tag {
  font-size: var(--text-xs);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-text-2);
}

.aq-tag--published {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.aq-tag--pending {
  color: #a06a1f;
  background: color-mix(in srgb, #a06a1f 12%, transparent);
}

.aq-tag--rejected {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.aq-tag--empty {
  color: var(--color-text-3);
  border: 1px dashed var(--color-border-strong);
  background: transparent;
}

.aq-date {
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.aq-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.aq-page {
  font-size: var(--text-sm);
  color: var(--color-text-3);
}
</style>
