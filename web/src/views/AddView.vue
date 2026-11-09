<script setup lang="ts">
/**
 * 投稿页（docs/api.md §2 POST /api/questions）
 *  - 前端校验：标题 1–200、正文 / 解析 1–20000、分类必须命中白名单
 *  - 提交成功后把 id 记进本机记录（MeView 用），并展示后端返回的 gate.tier / gate.reasons，
 *    让作者知道「为什么可能被重点审」
 *  - 未登录由路由守卫处理（/login?next=/add）
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import { ApiError } from '../api/client';
import { createQuestion } from '../api/endpoints';
import type { CreateQuestionResult } from '../api/endpoints';
import type { Tier } from '../api/types';
import { addMyQuestionRecord } from '../stores/myRecords';

/** 分类白名单：docs/api.md §8.1（13 项，含 Vue / React），必须与 api/src/lib/validate.ts 一致 */
const CATEGORIES: readonly string[] = [
  'Vue',
  'React',
  '工程化',
  'CSS',
  'JS',
  'TypeScript与类型系统',
  '流式处理与实时通信',
  '前端状态管理与数据流',
  '性能优化与渲染',
  '前端AI架构设计',
  'AI特性与前端工程实践',
  'AI工程化与前端工具链',
  '大模型前端集成',
];

const TITLE_MAX = 200;
const BODY_MAX = 20000;

const TIER_TEXT: Record<Tier, string> = {
  high: '高风险',
  medium: '中等风险',
  low: '低风险',
};

const TIER_HINT: Record<Tier, string> = {
  high: '会排在审核队列最前面，可能要求两位审核员复核。',
  medium: '会优先于普通投稿进入审核队列。',
  low: '按提交顺序进入审核队列。',
};

const router = useRouter();

const form = reactive({
  title: '',
  content: '',
  analysis: '',
  category: '',
});

const errors = reactive({
  title: '',
  content: '',
  analysis: '',
  category: '',
});

const submitting = ref(false);
const submitError = ref('');
const result = ref<CreateQuestionResult | null>(null);
const submittedTitle = ref('');

const titleLength = computed<number>(() => form.title.trim().length);
const contentLength = computed<number>(() => form.content.trim().length);
const analysisLength = computed<number>(() => form.analysis.trim().length);

function clearErrors(): void {
  errors.title = '';
  errors.content = '';
  errors.analysis = '';
  errors.category = '';
}

/** 服务端 zod 也是 trim 后按 length 计算，这里保持一致口径 */
function validate(): boolean {
  clearErrors();

  const title = form.title.trim();
  if (!title) errors.title = '标题不能为空';
  else if (title.length > TITLE_MAX) errors.title = `标题最多 ${TITLE_MAX} 字（当前 ${title.length}）`;

  const content = form.content.trim();
  if (!content) errors.content = '正文不能为空';
  else if (content.length > BODY_MAX)
    errors.content = `正文最多 ${BODY_MAX} 字（当前 ${content.length}）`;

  const analysis = form.analysis.trim();
  if (!analysis) errors.analysis = '解析不能为空';
  else if (analysis.length > BODY_MAX)
    errors.analysis = `解析最多 ${BODY_MAX} 字（当前 ${analysis.length}）`;

  if (!form.category) errors.category = '请选择分类';
  else if (!CATEGORIES.includes(form.category)) errors.category = '分类不在白名单内';

  return !errors.title && !errors.content && !errors.analysis && !errors.category;
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return '提交失败，请稍后重试';
  if (err.code === 'VALIDATION' && err.reasons.length > 0) {
    return `${err.message}（字段：${err.reasons.join('、')}）`;
  }
  return err.message;
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return;
  submitError.value = '';

  if (!validate()) return;

  submitting.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      analysis: form.analysis.trim(),
      category: form.category,
    };
    const data = await createQuestion(payload);

    result.value = data;
    submittedTitle.value = payload.title;
    addMyQuestionRecord({
      kind: 'question',
      id: data.id,
      title: payload.title,
      category: payload.category,
      createdAt: Date.now(),
      status: data.status,
    });

    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    // 会话过期：回到登录页并把目标带回去
    if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
      void router.replace({ name: 'login', query: { next: '/add' } });
      return;
    }
    submitError.value = errorMessage(err);
  } finally {
    submitting.value = false;
  }
}

function submitAnother(): void {
  form.title = '';
  form.content = '';
  form.analysis = '';
  form.category = '';
  clearErrors();
  submitError.value = '';
  result.value = null;
  submittedTitle.value = '';
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goMe(): void {
  void router.push({ name: 'me' });
}
</script>

<template>
  <div class="add">
    <section class="add-hero">
      <p class="eyebrow">投稿 · 新题</p>
      <h1 class="add-title">补充一道<span class="add-title__accent">面试题</span></h1>
      <p class="add-desc">
        标题说清问题，正文写题目背景，解析写参考答案。提交后先进入审核队列，
        通过后才会出现在题库里。
      </p>
    </section>

    <!-- 提交成功 -->
    <UiCard v-if="result" padding="lg" class="add-result">
      <p class="add-result__status">
        {{ result.status === 'published' ? '已发布' : '已提交，等待审核' }}
      </p>
      <p class="add-result__desc">
        《{{ submittedTitle }}》{{ result.status === 'published' ? '已经直接发布。' : '已进入审核队列。' }}
      </p>

      <div class="add-result__gate" :class="`add-result__gate--${result.gate.tier}`">
        <p class="add-result__gate-head">
          <span aria-hidden="true">⚠</span>
          审核等级：<strong>{{ TIER_TEXT[result.gate.tier] }}</strong>
          <span class="add-result__gate-code">（{{ result.gate.tier }}）</span>
        </p>
        <p class="add-result__gate-hint">{{ TIER_HINT[result.gate.tier] }}</p>

        <template v-if="result.gate.reasons.length">
          <p class="add-result__reasons-title">为什么可能被重点审</p>
          <ul class="add-result__reasons">
            <li v-for="(reason, index) in result.gate.reasons" :key="index">{{ reason }}</li>
          </ul>
        </template>
        <p v-else class="add-result__reasons-title">门禁没有给出风险原因，按默认级别排队。</p>
      </div>

      <div class="add-result__actions">
        <UiButton @click="submitAnother">再投一题</UiButton>
        <UiButton variant="ghost" @click="goMe">查看我的投稿</UiButton>
      </div>
    </UiCard>

    <!-- 投稿表单 -->
    <UiCard v-else padding="lg">
      <form class="add-form" novalidate @submit.prevent="onSubmit">
        <div class="field">
          <label class="field__label" for="add-title">
            标题<span class="field__required" aria-hidden="true">*</span>
          </label>
          <input
            id="add-title"
            v-model="form.title"
            class="field__input"
            type="text"
            :maxlength="TITLE_MAX"
            placeholder="例如：Vue 3 的响应式为什么改用 Proxy"
            :aria-invalid="Boolean(errors.title)"
          />
          <p class="field__foot">
            <span v-if="errors.title" class="field__error" role="alert">{{ errors.title }}</span>
            <span class="field__count">{{ titleLength }} / {{ TITLE_MAX }}</span>
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="add-content">
            正文<span class="field__required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="add-content"
            v-model="form.content"
            class="field__input field__input--area"
            rows="10"
            :maxlength="BODY_MAX"
            placeholder="题目背景、考察点、代码片段…"
            :aria-invalid="Boolean(errors.content)"
          ></textarea>
          <p class="field__foot">
            <span v-if="errors.content" class="field__error" role="alert">{{ errors.content }}</span>
            <span class="field__count">{{ contentLength }} / {{ BODY_MAX }}</span>
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="add-analysis">
            解析<span class="field__required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="add-analysis"
            v-model="form.analysis"
            class="field__input field__input--area"
            rows="8"
            :maxlength="BODY_MAX"
            placeholder="参考答案、关键点、常见误区…"
            :aria-invalid="Boolean(errors.analysis)"
          ></textarea>
          <p class="field__foot">
            <span v-if="errors.analysis" class="field__error" role="alert">{{ errors.analysis }}</span>
            <span class="field__count">{{ analysisLength }} / {{ BODY_MAX }}</span>
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="add-category">
            分类<span class="field__required" aria-hidden="true">*</span>
          </label>
          <select
            id="add-category"
            v-model="form.category"
            class="field__input field__input--select"
            :aria-invalid="Boolean(errors.category)"
          >
            <option value="" disabled>请选择分类</option>
            <option v-for="name in CATEGORIES" :key="name" :value="name">{{ name }}</option>
          </select>
          <p class="field__foot">
            <span v-if="errors.category" class="field__error" role="alert">{{ errors.category }}</span>
          </p>
        </div>

        <p v-if="submitError" class="add-form__error" role="alert">{{ submitError }}</p>

        <div class="add-form__actions">
          <UiButton block size="lg" :loading="submitting" @click="onSubmit">提交审核</UiButton>
        </div>

        <p class="add-form__note">
          提交后会经过内容门禁与人工审核。含外链、代码块、联系方式或图片的内容会被提高审核等级。
        </p>
      </form>
    </UiCard>
  </div>
</template>

<style scoped>
.add {
  padding-bottom: var(--space-6);
}

/* ---- Hero ---- */
.add-hero {
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

.add-title {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: 1.2;
  letter-spacing: calc(var(--rpx) * 1);
}

.add-title__accent {
  color: var(--color-primary);
  font-weight: var(--accent-weight);
}

.add-desc {
  max-width: calc(var(--rpx) * 560);
  margin-top: var(--space-2);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

/* ---- 表单 ---- */
.add-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  color: var(--color-text-2);
  font-size: var(--text-sm);
  font-weight: 600;
}

.field__required {
  margin-left: calc(var(--rpx) * 4);
  color: var(--color-danger);
}

.field__input {
  width: 100%;
  min-height: var(--input-height);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-1);
  font-family: inherit;
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  transition:
    border-color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.field__input::placeholder {
  color: var(--color-text-3);
}

.field__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
  outline: none;
}

.field__input--area {
  resize: vertical;
  min-height: calc(var(--rpx) * 240);
}

.field__input--select {
  appearance: none;
  cursor: pointer;
}

.field__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: calc(var(--rpx) * 30);
}

.field__error {
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.field__count {
  margin-left: auto;
  color: var(--color-text-3);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.add-form__error {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-soft);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.add-form__actions {
  margin-top: var(--space-1);
}

.add-form__note {
  color: var(--color-text-3);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}

/* ---- 结果 ---- */
.add-result__status {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-success);
  line-height: 1.3;
}

.add-result__desc {
  margin-top: var(--space-2);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

.add-result__gate {
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-sm);
}

.add-result__gate--high {
  border-left-color: var(--color-danger);
}

.add-result__gate--low {
  border-left-color: var(--color-success);
}

.add-result__gate-head {
  color: var(--color-text-1);
  font-size: var(--text-md);
}

.add-result__gate-code {
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

.add-result__gate-hint {
  margin-top: var(--space-1);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.add-result__reasons-title {
  margin-top: var(--space-3);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  font-weight: 600;
}

.add-result__reasons {
  margin-top: var(--space-1);
  padding-left: var(--space-3);
  list-style: disc;
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.add-result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
</style>
