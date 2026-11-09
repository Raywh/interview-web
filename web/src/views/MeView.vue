<script setup lang="ts">
/**
 * 我的投稿 / 我的评论（docs/api.md §9）。
 *
 * 数据来自服务端（`/api/me/questions`、`/api/me/comments`），不再依赖 localStorage，
 * 所以换设备、清缓存都不丢。两个接口**不受 status 限制**，待审和已拒绝的也能看到。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import UiEmpty from '../components/UiEmpty.vue';
import { ApiError } from '../api/client';
import { getMyComments, getMyQuestions } from '../api/endpoints';
import type { MyComment, MyQuestionSummary, Status } from '../api/types';
import { formatDate } from '../lib/format';

type Tab = 'questions' | 'comments';

const STATUS_TEXT: Record<Status, string> = {
  published: '已发布',
  pending: '待审',
  rejected: '已拒绝',
  hidden: '已下架',
};

const tab = ref<Tab>('questions');
const questions = ref<MyQuestionSummary[]>([]);
const comments = ref<MyComment[]>([]);
const loading = ref(true);
const error = ref('');

const questionCount = computed(() => questions.value.length);
const commentCount = computed(() => comments.value.length);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [q, c] = await Promise.all([getMyQuestions({ pageSize: 50 }), getMyComments({ pageSize: 50 })]);
    questions.value = q.items;
    comments.value = c.items;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
      error.value = '登录已失效，请重新登录';
    } else {
      error.value = err instanceof Error ? err.message : '加载失败，请稍后重试';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="me">
    <header class="me-hero">
      <p class="eyebrow">个人中心</p>
      <h1 class="me-title">我的<em>记录</em></h1>
      <p class="me-desc">投稿与评论都在这里，待审和已拒绝的也会显示。</p>
    </header>

    <div class="me-tabs" role="tablist">
      <button
        type="button"
        class="me-tab"
        :class="{ 'me-tab--active': tab === 'questions' }"
        role="tab"
        :aria-selected="tab === 'questions'"
        @click="tab = 'questions'"
      >
        我的投稿<span v-if="questionCount" class="me-tab__count">{{ questionCount }}</span>
      </button>
      <button
        type="button"
        class="me-tab"
        :class="{ 'me-tab--active': tab === 'comments' }"
        role="tab"
        :aria-selected="tab === 'comments'"
        @click="tab = 'comments'"
      >
        我的评论<span v-if="commentCount" class="me-tab__count">{{ commentCount }}</span>
      </button>
    </div>

    <div v-if="loading" class="me-state" role="status">加载中…</div>

    <div v-else-if="error" class="me-state me-state--error" role="alert">
      <p>{{ error }}</p>
      <UiButton variant="ghost" @click="load">重试</UiButton>
    </div>

    <template v-else>
      <div v-if="tab === 'questions'">
        <ul v-if="questions.length" class="record-list">
          <li v-for="item in questions" :key="item.id" class="record">
            <RouterLink class="record__link" :to="{ name: 'detail', params: { id: item.id } }">
              <div class="record__head">
                <span class="status-badge" :class="`status-badge--${item.status}`">
                  {{ STATUS_TEXT[item.status] }}
                </span>
                <span class="record__date">{{ formatDate(item.createdAt) }}</span>
              </div>
              <h2 class="record__title">{{ item.title }}</h2>
              <p class="record__excerpt">{{ item.excerpt }}</p>
              <p v-if="item.status === 'rejected'" class="record__reason">
                拒绝原因：{{ item.rejectReason || '管理员未填写原因' }}
              </p>
            </RouterLink>
          </li>
        </ul>
        <UiEmpty v-else icon="📝" text="还没有投过稿，去写一道？" />
      </div>

      <div v-else>
        <ul v-if="comments.length" class="record-list">
          <li v-for="item in comments" :key="item.id" class="record">
            <RouterLink class="record__link" :to="{ name: 'detail', params: { id: item.questionId } }">
              <div class="record__head">
                <span class="status-badge" :class="`status-badge--${item.status}`">
                  {{ STATUS_TEXT[item.status] }}
                </span>
                <span class="record__date">{{ formatDate(item.createdAt) }}</span>
              </div>
              <p class="record__comment">{{ item.content }}</p>
              <p class="record__meta">在《{{ item.questionTitle }}》下</p>
            </RouterLink>
          </li>
        </ul>
        <UiEmpty v-else icon="💬" text="还没有评论过" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.me {
  padding-bottom: var(--space-6);
}

.me-hero {
  margin: var(--space-4) 0 var(--space-5);
}

.eyebrow {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  letter-spacing: var(--eyebrow-spacing);
  color: var(--color-primary);
  text-transform: uppercase;
}

.me-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-3xl);
  font-weight: var(--accent-weight);
  color: var(--color-text-1);
}

.me-title em {
  font-style: normal;
  color: var(--color-primary);
}

.me-desc {
  margin: var(--space-2) 0 0;
  color: var(--color-text-2);
  font-size: var(--text-sm);
}

.me-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.me-tab {
  position: relative;
  padding: var(--space-2) var(--space-2) var(--space-3);
  background: none;
  border: 0;
  font-size: var(--text-md);
  color: var(--color-text-3);
  cursor: pointer;
}

.me-tab--active {
  color: var(--color-text-1);
  font-weight: 600;
}

.me-tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--color-primary);
}

.me-tab__count {
  margin-left: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.me-state {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--color-text-3);
}

.me-state--error {
  color: var(--color-danger);
}

.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.record {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.record__link {
  display: block;
  padding: var(--space-4);
  text-decoration: none;
  color: inherit;
}

.record__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.status-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: calc(var(--rpx) * 4) calc(var(--rpx) * 12);
  border-radius: var(--radius-full);
}

.status-badge--published {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.status-badge--pending {
  color: #A06A1F;
  background: color-mix(in srgb, #A06A1F 12%, transparent);
}

.status-badge--rejected {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.status-badge--hidden {
  color: var(--color-text-3);
  background: var(--color-surface-muted);
}

.record__date {
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.record__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-1);
  line-height: var(--leading-tight);
}

.record__excerpt,
.record__comment {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-2);
  line-height: var(--leading-normal);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.record__meta {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.record__reason {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  color: var(--color-danger);
  font-size: var(--text-sm);
}
</style>
