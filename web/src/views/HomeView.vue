<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import UiChip from '../components/UiChip.vue';
import CategoryMark from '../components/CategoryMark.vue';
import UiEmpty from '../components/UiEmpty.vue';
import { getQuestions, getStats } from '../api/client';
import type { QuestionSummary, Stats } from '../api/types';

// 供 App.vue 的 <KeepAlive include="HomeView"> 匹配
defineOptions({ name: 'HomeView' });

const ALL_CATEGORIES = '全部';
const PAGE_SIZE = 20;
/** 小程序 Hero 的「AI ×5 每日生成」；/api/stats 没有 AI 维度，沿用其常量 */
const AI_DAILY_COUNT = 5;

const stats = ref<Stats | null>(null);
const items = ref<QuestionSummary[]>([]);
const total = ref(0);
const category = ref(ALL_CATEGORIES);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const moreError = ref('');
/** 关键词搜索 */
const keyword = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

let requestSeq = 0;

const categories = computed<string[]>(() => [
  ALL_CATEGORIES,
  ...(stats.value?.categories.map((item) => item.name) ?? []),
]);

/** 分类白名单含 0 条的分类也会由 /api/stats 返回，这里按接口返回的分类数展示 */
const categoryCount = computed<number | null>(() => {
  if (!stats.value) return null;
  return stats.value.categories.length;
});

const heroTotal = computed<string>(() => {
  if (stats.value) return String(stats.value.total);
  return total.value > 0 ? String(total.value) : '—';
});

const heroCategories = computed<string>(() =>
  categoryCount.value === null ? '—' : String(categoryCount.value),
);

async function loadStats(): Promise<void> {
  try {
    stats.value = await getStats();
  } catch {
    // 统计失败不影响列表；Hero 会退回列表 total / 显示「—」
    stats.value = null;
  }
}

function currentCategoryParam(): string | undefined {
  return category.value === ALL_CATEGORIES ? undefined : category.value;
}

async function loadFirstPage(): Promise<void> {
  const requestId = ++requestSeq;
  loading.value = true;
  loadingMore.value = false;
  error.value = '';
  moreError.value = '';

  try {
    const data = await getQuestions({
      category: currentCategoryParam(),
      q: keyword.value.trim() || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    if (requestId !== requestSeq) return;

    items.value = data.items;
    total.value = data.total;
    page.value = data.page;
    hasMore.value = data.hasMore;
  } catch (err) {
    if (requestId !== requestSeq) return;
    items.value = [];
    hasMore.value = false;
    error.value = err instanceof Error ? err.message : '加载失败，请稍后重试';
  } finally {
    if (requestId === requestSeq) loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !hasMore.value) return;

  const requestId = requestSeq;
  loadingMore.value = true;
  moreError.value = '';

  try {
    const data = await getQuestions({
      category: currentCategoryParam(),
      q: keyword.value.trim() || undefined,
      page: page.value + 1,
      pageSize: PAGE_SIZE,
    });
    if (requestId !== requestSeq) return;

    const known = new Set(items.value.map((item) => item.id));
    items.value = [...items.value, ...data.items.filter((item) => !known.has(item.id))];
    total.value = data.total;
    page.value = data.page;
    hasMore.value = data.hasMore;
  } catch (err) {
    if (requestId !== requestSeq) return;
    moreError.value = err instanceof Error ? err.message : '加载更多失败，请重试';
  } finally {
    if (requestId === requestSeq) loadingMore.value = false;
  }
}

function selectCategory(label: string): void {
  if (label === category.value) return;
  category.value = label;
  void loadFirstPage();
}

/** 首屏失败时同时重试统计与列表 */
function reload(): void {
  void loadStats();
  void loadFirstPage();
}

/**
 * 输入防抖：停止输入 300ms 后才发请求（trailing debounce）。
 * 每次输入都会重置计时器，所以连续打字只会在最后发一次。
 */
function onKeywordInput(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    void loadFirstPage();
  }, 300);
}

/** 回车立即搜（不等防抖） */
function flushSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  void loadFirstPage();
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function clearKeyword(): void {
  keyword.value = '';
  void loadFirstPage();
}

onMounted(() => {
  void loadStats();
  void loadFirstPage();
});

/**
 * KeepAlive 复活时（比如从详情/审核台返回）检查题库总量有没有变。
 * 变了才重新拉第一页 —— 既能让刚审核通过的题立刻出现，又不会每次返回都重置列表。
 */
onActivated(async () => {
  if (loading.value) return;
  try {
    const next = await getStats();
    const prev = stats.value?.total ?? -1;
    stats.value = next;
    if (next.total !== prev) {
      await loadFirstPage();
    }
  } catch {
    // 统计失败就算了，不打扰用户
  }
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <p class="eyebrow">前端面试 · 题库</p>
      <h1 class="hero-title">面试<span class="hero-title__accent">题库</span></h1>
      <p class="hero-desc">多题多分类 · 解析详尽 · AI 每日更新，一起把面试准备得更从容。</p>

      <div class="hero-stats" aria-label="题库统计">
        <div class="hero-stat">
          <span class="hero-stat__num">{{ heroTotal }}</span>
          <span class="hero-stat__unit">道题</span>
          <span class="hero-stat__label">已收录</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__num">{{ heroCategories }}</span>
          <span class="hero-stat__unit">类</span>
          <span class="hero-stat__label">专题分类</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__num">AI</span>
          <span class="hero-stat__unit">×{{ AI_DAILY_COUNT }}</span>
          <span class="hero-stat__label">每日生成</span>
        </div>
      </div>
    </section>

    <nav class="category-scroll" aria-label="按分类筛选">
      <div class="category-list">
        <UiChip
          v-for="name in categories"
          :key="name"
          :label="name"
          :active="category === name"
          @select="selectCategory"
        />
      </div>
    </nav>

    <div class="search-bar">
      <input
        v-model="keyword"
        type="search"
        class="search-input"
        placeholder="搜索题目关键词…"
        aria-label="搜索题目"
        @input="onKeywordInput"
        @keydown.enter="flushSearch"
      />
      <button v-if="keyword" type="button" class="search-clear" aria-label="清空搜索" @click="clearKeyword">
        ✕
      </button>
    </div>
    <p v-if="keyword.trim()" class="search-hint">搜索「{{ keyword.trim() }}」 · {{ total }} 条结果</p>
    <p v-if="loading && items.length" class="searching" role="status">搜索中…</p>

    <div v-if="loading && !items.length" class="list-region" role="status" aria-label="正在加载题目">
      <div v-for="n in 4" :key="n" class="skeleton-card" aria-hidden="true">
        <div class="skeleton-date"></div>
        <div class="skeleton-body">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error" class="state-block" role="alert">
      <UiEmpty icon="⚠️" :text="error" />
      <UiButton variant="ghost" @click="reload">重新加载</UiButton>
    </div>

    <div v-else-if="items.length" class="question-list">
      <RouterLink
        v-for="item in items"
        :key="item.id"
        class="question-link"
        :to="{ name: 'detail', params: { id: item.id } }"
      >
        <UiCard padding="md" class="question-card">
          <div class="question-card__main">
            <CategoryMark :category="item.category" />
            <div class="question-card__body">
              <h2 class="question-card__title clamp-2">{{ item.title }}</h2>
              <p class="question-card__content clamp-2">{{ item.excerpt }}</p>
              <div v-if="item.category" class="question-card__meta">
                <UiChip :label="item.category" size="sm" :tappable="false" />
              </div>
            </div>
            <span class="question-card__arrow" aria-hidden="true">›</span>
          </div>
        </UiCard>
      </RouterLink>

      <div class="list-footer">
        <template v-if="hasMore">
          <UiButton variant="ghost" :loading="loadingMore" @click="loadMore">加载更多</UiButton>
          <p v-if="moreError" class="list-footer__error" role="alert">{{ moreError }}</p>
        </template>
        <p v-else class="list-footer__end">— 到底啦 —</p>
      </div>
    </div>

    <UiEmpty v-else icon="🗂" text="该分类下暂无题目" />
  </div>
</template>

<style scoped>
.home {
  padding-bottom: var(--space-6);
}

/* ---- Hero ---- */
.hero {
  padding: var(--space-4) 0 var(--space-5);
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

.hero-title {
  font-family: var(--font-serif);
  font-size: var(--text-3xl);
  font-weight: 900;
  color: var(--color-text-1);
  line-height: 1.15;
  letter-spacing: calc(var(--rpx) * 2);
}

.hero-title__accent {
  color: var(--color-primary);
  font-weight: 900;
}

.hero-desc {
  max-width: calc(var(--rpx) * 560);
  margin-top: var(--space-2);
  font-size: var(--text-md);
  color: var(--color-text-2);
  line-height: var(--leading-normal);
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin-top: var(--space-5);
}

.hero-stat {
  display: flex;
  flex-direction: column;
}

.hero-stat__num {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.hero-stat__unit {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.hero-stat__label {
  margin-top: calc(var(--rpx) * 4);
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

/* ---- 分类筛选（横向滚动） ---- */
.category-scroll {
  margin: 0 calc(var(--page-padding) * -1) var(--space-5);
  padding: var(--space-1) var(--page-padding);
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.category-scroll::-webkit-scrollbar {
  display: none;
}

.category-list {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) 0;
  white-space: nowrap;
}

/* ---- 题目列表 ---- */
.question-link {
  display: block;
  margin-bottom: var(--card-gap);
  border-radius: var(--radius-lg);
}

.question-card__main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.question-card__body {
  flex: 1;
  min-width: 0;
}

.question-card__title {
  color: var(--color-text-1);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-tight);
  transition: color var(--duration-fast) var(--ease-out);
}

.question-card__content {
  margin-top: var(--space-2);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

.question-card__meta {
  display: flex;
  align-items: center;
  margin-top: var(--space-2);
}

.question-card__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex-shrink: 0;
  width: calc(var(--rpx) * 56);
  height: calc(var(--rpx) * 56);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-text-3);
  font-size: calc(var(--rpx) * 36);
  line-height: 1;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .question-link:hover .question-card__title {
    color: var(--color-primary);
  }

  .question-link:hover .question-card__arrow {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

/* ---- 加载更多 / 空态 / 错误态 ---- */
.list-footer {
  padding: var(--space-5) 0 var(--space-6);
  text-align: center;
}

.list-footer__end {
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

.list-footer__error {
  margin-top: var(--space-2);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-6);
}

/* ---- 搜索 ---- */
.search-bar {
  position: relative;
  margin: var(--space-3) 0 var(--space-2);
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: calc(var(--rpx) * 20) calc(var(--rpx) * 72) calc(var(--rpx) * 20) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-1);
  font-size: var(--text-sm);
  font-family: inherit;
}

.search-input:focus {
  outline: 2px solid var(--color-primary-soft);
  border-color: var(--color-primary);
}

.search-clear {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  width: calc(var(--rpx) * 48);
  height: calc(var(--rpx) * 48);
  border: 0;
  border-radius: 50%;
  background: var(--color-surface-muted);
  color: var(--color-text-3);
  cursor: pointer;
  font-size: var(--text-xs);
}

.search-hint {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.searching {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-3);
}
</style>
