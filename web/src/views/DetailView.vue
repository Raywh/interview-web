<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import CodeBlock from '../components/CodeBlock.vue';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import UiChip from '../components/UiChip.vue';
import UiEmpty from '../components/UiEmpty.vue';
import UiSection from '../components/UiSection.vue';
import { ApiError, getQuestion } from '../api/client';
import { askAi, getComments, postAiComment, postComment, setVisibility } from '../api/endpoints';
import type { CommentItem, GateResult } from '../api/endpoints';
import type { Question } from '../api/types';
import { copyText } from '../lib/clipboard';
import { formatDate } from '../lib/format';
import { parseAnswer } from '../lib/parseAnswer';
import { useAuthStore } from '../stores/auth';

const SITE_TITLE = '前端面试题库';

const route = useRoute();
const router = useRouter();

const question = ref<Question | null>(null);
const loading = ref(true);
const error = ref('');
const errorCode = ref('');

const contentParts = computed(() => (question.value ? parseAnswer(question.value.content) : []));
const analysisParts = computed(() => (question.value ? parseAnswer(question.value.analysis) : []));

type CopyState = 'idle' | 'copied' | 'failed';

const copyState = ref<CopyState>('idle');
const copyLabel = computed(() => {
  if (copyState.value === 'copied') return '已复制';
  if (copyState.value === 'failed') return '复制失败';
  return '复制';
});

const auth = useAuthStore();

// ── AI 问答（评论区里的 @AI）──────────────────────────
const aiDraft = ref('');
const aiDraftQuestion = ref('');
const aiError = ref('');
const aiMeta = ref<{ used: number; limit: number } | null>(null);

// ── 讨论区 ──────────────────────────────────────────────

const visibilityBusy = ref(false);
const visibilityMsg = ref('');
const isHidden = computed(() => question.value?.status === 'hidden');

async function toggleVisibility(): Promise<void> {
  const q = question.value;
  if (!q || visibilityBusy.value) return;
  visibilityBusy.value = true;
  visibilityMsg.value = '';
  try {
    await setVisibility('question', q.id, !isHidden.value);
    visibilityMsg.value = isHidden.value ? '已恢复上架' : '已下架';
    await load();
  } catch (err) {
    visibilityMsg.value = err instanceof Error ? err.message : '操作失败';
  } finally {
    visibilityBusy.value = false;
  }
}

const comments = ref<CommentItem[]>([]);
const commentsLoading = ref(false);
const commentsError = ref('');
const commentText = ref('');
const commentInputEl = ref<HTMLTextAreaElement | null>(null);

/** 点「继续追问」：预填 @AI 并聚焦，AI 会带上本题最近几轮问答作为上下文 */
function startFollowUp(): void {
  commentText.value = '@AI ';
  void nextTick(() => {
    commentInputEl.value?.focus();
  });
}
const commentSubmitting = ref(false);
const commentNotice = ref('');
const commentGate = ref<GateResult | null>(null);

const loginHref = computed<string>(() => {
  const current = route.fullPath;
  return `/login?next=${encodeURIComponent(current)}`;
});

const canSubmitComment = computed(
  () => auth.isLoggedIn && commentText.value.trim().length > 0 && !commentSubmitting.value,
);

async function loadComments(questionId: string): Promise<void> {
  commentsLoading.value = true;
  commentsError.value = '';
  try {
    const page = await getComments(questionId, { pageSize: 50 });
    comments.value = page.items;
  } catch {
    // 评论加载失败不能影响正文
    commentsError.value = '评论加载失败';
    comments.value = [];
  } finally {
    commentsLoading.value = false;
  }
}

/** 以 @AI 开头的评论 = 向 AI 提问（大小写都认） */
const AI_PREFIX = /^@(ai|AI|Ai|aI)\s*/;

async function submitComment(): Promise<void> {
  const content = commentText.value.trim();
  if (!content || !question.value || commentSubmitting.value) return;

  if (AI_PREFIX.test(content)) {
    await askAiInComments(content.replace(AI_PREFIX, '').trim());
    return;
  }

  commentSubmitting.value = true;
  commentNotice.value = '';
  commentGate.value = null;
  try {
    const result = await postComment(question.value.id, content);
    commentText.value = '';
    commentNotice.value = '已提交，审核通过后可见';
    commentGate.value = result.gate ?? null;
  } catch (err) {
    commentNotice.value = err instanceof ApiError ? err.message : '发送失败，请稍后再试';
  } finally {
    commentSubmitting.value = false;
  }
}

/**
 * 评论区的 AI 问答：
 *   提问 → 流式拿回答 → 落库成一条 AI 评论 → 刷新列表
 * 流式过程中先用 aiDraft 在评论区顶部「就地」显示，结束后替换成真正的评论。
 */
async function askAiInComments(rawQuestion: string): Promise<void> {
  if (!question.value) return;
  if (!rawQuestion) {
    commentNotice.value = '请在 @AI 后面写上你的问题';
    return;
  }

  commentSubmitting.value = true;
  commentNotice.value = '';
  commentGate.value = null;
  aiDraftQuestion.value = rawQuestion;
  aiDraft.value = '';
  aiError.value = '';

  try {
    await askAi(question.value.id, rawQuestion, {
      onDelta: (text) => {
        aiDraft.value += text;
      },
      onDone: (meta) => {
        aiMeta.value = meta;
      },
    });

    const saved = await postAiComment(question.value.id, rawQuestion, aiDraft.value);
    commentText.value = '';
    commentNotice.value =
      saved.status === 'published' ? 'AI 已回答' : 'AI 已回答，等待管理员确认后显示';
    await loadComments(question.value.id);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      commentNotice.value = '已停止';
    } else {
      aiError.value = err instanceof ApiError ? err.message : 'AI 暂时不可用，请稍后再试';
    }
  } finally {
    aiDraft.value = '';
    aiDraftQuestion.value = '';
    commentSubmitting.value = false;
  }
}

let requestSeq = 0;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

async function load(): Promise<void> {
  const id = typeof route.params.id === 'string' ? route.params.id : '';
  if (!id) {
    loading.value = false;
    error.value = '题目不存在';
    return;
  }

  const requestId = ++requestSeq;
  loading.value = true;
  error.value = '';
  errorCode.value = '';
  question.value = null;
  copyState.value = 'idle';

  try {
    const data = await getQuestion(id);
    if (requestId !== requestSeq || disposed) return;
    question.value = data;
    document.title = `${data.title} · ${SITE_TITLE}`;
    aiError.value = '';
    aiMeta.value = null;
    void loadComments(data.id);
  } catch (err) {
    if (requestId !== requestSeq || disposed) return;
    error.value = err instanceof Error ? err.message : '加载失败，请稍后重试';
    errorCode.value = err instanceof ApiError ? err.code : '';
  } finally {
    if (requestId === requestSeq && !disposed) loading.value = false;
  }
}

async function onCopyAnalysis(): Promise<void> {
  const analysis = question.value?.analysis ?? '';
  if (!analysis) return;

  const ok = await copyText(analysis);
  copyState.value = ok ? 'copied' : 'failed';
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyState.value = 'idle';
  }, 2000);
}

function goBack(): void {
  const state = window.history.state as { back?: string | null } | null;
  if (state?.back) {
    router.back();
  } else {
    void router.push({ name: 'home' });
  }
}

watch(
  () => route.params.id,
  () => {
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disposed = true;
  requestSeq += 1;
  if (copyTimer) clearTimeout(copyTimer);
  document.title = SITE_TITLE;
});
</script>

<template>
  <div class="detail">
    <div class="detail-topbar">
      <button type="button" class="detail-back" @click="goBack">← 返回列表</button>
      <button
        v-if="auth.isAdmin && question"
        type="button"
        class="detail-admin-action"
        :disabled="visibilityBusy"
        @click="toggleVisibility"
      >
        {{ visibilityBusy ? '处理中…' : isHidden ? '恢复上架' : '下架' }}
      </button>
    </div>
    <p v-if="visibilityMsg" class="detail-admin-msg">{{ visibilityMsg }}</p>

    <div v-if="loading" class="detail-skeleton" role="status" aria-label="正在加载题目">
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-body">
          <div class="skeleton-line skeleton-line--xs"></div>
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-body">
          <div class="skeleton-line skeleton-line--xs"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error" class="state-block" role="alert">
      <UiEmpty
        :icon="errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN' ? '🔒' : '🗂'"
        :text="error"
      />
      <UiButton variant="ghost" @click="goBack">返回列表</UiButton>
    </div>

    <template v-else-if="question">
      <div v-if="question.status === 'rejected'" class="rejected-banner" role="alert">
        <strong>这篇投稿被拒绝了</strong>
        <p>{{ question.rejectReason || '管理员未填写原因' }}</p>
        <p class="rejected-banner__hint">改完后可以重新提交。</p>
      </div>

      <UiCard padding="lg" class="detail-hero">
        <p class="eyebrow">题目 · 详情</p>
        <div v-if="question.category" class="detail-hero__top">
          <UiChip :label="question.category" size="sm" :tappable="false" />
        </div>
        <h1 class="detail-hero__title">{{ question.title }}</h1>
        <p class="detail-hero__meta">
          {{ formatDate(question.createdAt) }}<span v-if="question.isAi"> · AI 生成</span>
        </p>
      </UiCard>

      <section class="section-block">
        <UiSection eyebrow="01 · 核心内容" title="核心" accent="内容">
          <UiCard padding="md">
            <template v-if="contentParts.length">
              <template v-for="(part, index) in contentParts" :key="index">
                <div v-if="part.type === 'text'" class="rich-text" v-html="part.html"></div>
                <CodeBlock v-else :code="part.code" :lang="part.lang" :tokens="part.tokens" />
              </template>
            </template>
            <UiEmpty v-else icon="📝" text="暂无核心内容" />
          </UiCard>
        </UiSection>
      </section>

      <section class="section-block section-alt">
        <UiSection eyebrow="02 · 答案解析" title="答案" accent="解析">
          <template #extra>
            <UiButton
              variant="plain"
              size="md"
              :disabled="!question.analysis"
              aria-live="polite"
              @click="onCopyAnalysis"
            >
              {{ copyLabel }}
            </UiButton>
          </template>

          <UiCard padding="md">
            <template v-if="analysisParts.length">
              <template v-for="(part, index) in analysisParts" :key="index">
                <div v-if="part.type === 'text'" class="rich-text" v-html="part.html"></div>
                <CodeBlock v-else :code="part.code" :lang="part.lang" :tokens="part.tokens" />
              </template>
            </template>
            <UiEmpty v-else icon="📝" text="暂无解析" />
          </UiCard>
        </UiSection>
      </section>

      <section class="section-block section-alt">
        <UiSection
          eyebrow="03 · 讨论区"
          title="大家"
          accent="讨论"
          :desc="commentsLoading ? '加载中…' : `${comments.length} 条讨论`"
        >
          <UiCard padding="md">
            <div v-if="commentsError" class="comment-hint comment-hint--error">{{ commentsError }}</div>

            <ul v-if="comments.length || aiDraftQuestion" class="comment-list">
              <li v-if="aiDraftQuestion" class="comment-item comment-item--ai">
                <div class="comment-item__avatar">🤖</div>
                <div class="comment-item__main">
                  <div class="comment-item__head">
                    <span class="comment-item__name">AI 助手</span>
                    <span class="ai-badge">生成中</span>
                  </div>
                  <blockquote class="comment-item__quote">{{ aiDraftQuestion }}</blockquote>
                  <p class="comment-item__text">{{ aiDraft }}<span class="ai-cursor" aria-hidden="true">▍</span></p>
                </div>
              </li>

              <li
                v-for="item in comments"
                :key="item.id"
                class="comment-item"
                :class="{ 'comment-item--ai': item.isAi }"
              >
                <div class="comment-item__avatar">{{ item.isAi ? '🤖' : (item.userName || '匿').slice(0, 1) }}</div>
                <div class="comment-item__main">
                  <div class="comment-item__head">
                    <span class="comment-item__name">{{ item.isAi ? 'AI 助手' : (item.userName || '匿名用户') }}</span>
                    <span v-if="item.isAi" class="ai-badge">AI</span>
                    <span
                      v-if="item.isAi && item.riskTier === 'high'"
                      class="ai-risk"
                      title="门禁判定为高风险，管理员可复核或下架"
                    >
                      ⚠ 需留意
                    </span>
                    <time class="comment-item__time">{{ formatDate(item.createdAt) }}</time>
                  </div>
                  <blockquote v-if="item.quote" class="comment-item__quote">{{ item.quote }}</blockquote>
                  <p class="comment-item__text">{{ item.content }}</p>
                </div>
              </li>
            </ul>

            <UiEmpty v-else icon="💬" text="暂无讨论，来说两句？（以 @AI 开头可向 AI 提问）" />

            <div class="comment-form">
              <template v-if="auth.isLoggedIn">
                <textarea
                  v-model="commentText"
                  class="comment-input"
                  rows="3"
                  maxlength="500"
                  placeholder="说说你的理解… 以 @AI 开头可向 AI 提问"
                ></textarea>
                <div class="comment-form__footer">
                  <span class="comment-form__count">
                    {{ commentText.length }}/500 · 以 <code>@AI</code> 开头问 AI（会记住本题上下文）
                  </span>
                  <UiButton size="md" :disabled="!canSubmitComment" @click="submitComment">
                    {{ commentSubmitting ? '发送中…' : '发送' }}
                  </UiButton>
                </div>
              </template>
              <p v-else class="comment-hint">
                <RouterLink :to="loginHref" class="comment-login-link">登录</RouterLink>
                后参与讨论
              </p>
            </div>

            <p v-if="commentNotice" class="comment-hint comment-hint--ok">{{ commentNotice }}</p>
            <p v-if="commentGate" class="comment-hint">
              风险提示：{{ commentGate.reasons.join('、') || '待人工审核' }}
            </p>
          </UiCard>
        </UiSection>
      </section>

      <div class="detail-actions">
        <UiButton variant="ghost" block @click="goBack">返回列表</UiButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail {
  padding-bottom: var(--space-6);
}

.detail-topbar {
  margin-bottom: var(--space-3);
}

.detail-back {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--color-text-3);
  font-size: var(--text-sm);
  line-height: 1.4;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .detail-back:hover {
    color: var(--color-primary);
  }
}

/* ---- 标题区 ---- */
.detail-hero {
  margin-bottom: var(--space-5);
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: var(--eyebrow-size);
  letter-spacing: 0.26em;
  line-height: 1.4;
}

.detail-hero__top {
  margin-bottom: var(--space-3);
}

.detail-hero__title {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: var(--leading-tight);
  letter-spacing: calc(var(--rpx) * 1);
}

.detail-hero__meta {
  margin-top: var(--space-2);
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

/* ---- 区块 ---- */
.section-block {
  margin-top: var(--space-5);
  margin-bottom: var(--space-5);
}

/* 交替区块：米色底铺满容器（对齐小程序 section-alt） */
.section-alt {
  margin-right: calc(var(--page-padding) * -1);
  margin-left: calc(var(--page-padding) * -1);
  padding: var(--space-5) var(--page-padding);
  background: var(--color-bg-soft);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.detail-actions {
  margin-top: var(--space-5);
}

/* ---- 富文本（v-html 产物自带内联字号/颜色，这里补排版兜底） ---- */
.rich-text {
  overflow-wrap: anywhere;
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed);
}

.rich-text :deep(ul) {
  list-style: disc;
}

.rich-text :deep(ol) {
  list-style: decimal;
}

.rich-text :deep(code) {
  font-family: var(--font-mono);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-6);
}

.detail-skeleton {
  display: block;
}
.rejected-banner {
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
}

.rejected-banner strong {
  display: block;
  font-size: var(--text-md);
  color: var(--color-danger);
  margin-bottom: var(--space-2);
}

.rejected-banner p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-1);
  line-height: var(--leading-relaxed);
}

.rejected-banner__hint {
  margin-top: var(--space-2) !important;
  color: var(--color-text-3) !important;
}

/* ---- 讨论区 ---- */
.comment-list {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.comment-item {
  display: flex;
  gap: var(--space-2);
}

.comment-item__avatar {
  flex-shrink: 0;
  width: calc(var(--rpx) * 56);
  height: calc(var(--rpx) * 56);
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comment-item__main {
  min-width: 0;
}

.comment-item__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.comment-item__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-1);
}

.comment-item__time {
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.comment-item__text {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--color-text-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-form {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}

.comment-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: calc(var(--rpx) * 140);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text-1);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  font-family: inherit;
}

.comment-input:focus {
  outline: 2px solid var(--color-primary-soft);
  border-color: var(--color-primary);
}

.comment-form__footer {
  margin-top: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment-form__count {
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.comment-hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-3);
}

.comment-hint--ok {
  color: var(--color-success);
}

.comment-hint--error {
  color: var(--color-danger);
}

.comment-login-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
}


.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.detail-admin-action {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-danger);
  font-size: var(--text-xs);
  cursor: pointer;
}

.detail-admin-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.detail-admin-msg {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

/* ---- AI 追问 ---- */
.ai-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.ai-input {
  flex: 1;
  min-width: 0;
  padding: calc(var(--rpx) * 18) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text-1);
  font-size: var(--text-sm);
  font-family: inherit;
}

.ai-input:focus {
  outline: 2px solid var(--color-primary-soft);
  border-color: var(--color-primary);
}

.ai-meta {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-3);
}

.ai-error {
  margin-top: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.ai-answer {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.ai-answer__text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--color-text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-cursor {
  color: var(--color-primary);
  animation: ai-blink 1s steps(2, start) infinite;
}

@keyframes ai-blink {
  to { visibility: hidden; }
}

.ai-login {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-3);
}

/* ---- AI 评论 ---- */
.comment-item--ai {
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}

.ai-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
}

.comment-item__quote {
  margin: var(--space-1) 0;
  padding: var(--space-1) var(--space-2);
  border-left: 2px solid var(--color-border-strong);
  color: var(--color-text-3);
  font-size: var(--text-sm);
  white-space: pre-wrap;
}

.comment-form__count code {
  font-size: var(--text-xs);
  color: var(--color-primary);
}

.follow-up {
  margin-top: var(--space-1);
  padding: 0;
  background: none;
  border: 0;
  color: var(--color-primary);
  font-size: var(--text-xs);
  cursor: pointer;
  text-decoration: underline;
}

.ai-risk {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
}
</style>
