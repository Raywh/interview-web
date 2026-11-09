<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { copyText } from '../lib/clipboard';
import type { HighlightToken } from '../lib/highlight';

const props = withDefaults(
  defineProps<{
    code: string;
    lang?: string;
    tokens: HighlightToken[];
  }>(),
  {
    lang: '',
  },
);

type CopyState = 'idle' | 'copied' | 'failed';

const copyState = ref<CopyState>('idle');
let timer: ReturnType<typeof setTimeout> | undefined;

const copyLabel = { idle: '复制', copied: '已复制', failed: '复制失败' } as const;

async function onCopy(): Promise<void> {
  const ok = await copyText(props.code);
  copyState.value = ok ? 'copied' : 'failed';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

// 组件可能因 v-for 索引复用而换了一份代码，复位复制态，避免显示上一块的“已复制”
watch(
  () => props.code,
  () => {
    copyState.value = 'idle';
    if (timer) clearTimeout(timer);
  },
);
</script>

<template>
  <div class="code-block">
    <div class="code-block__head">
      <button
        type="button"
        class="code-block__copy"
        aria-live="polite"
        @click="onCopy"
      >
        {{ copyLabel[copyState] }}
      </button>
      <span v-if="lang" class="code-block__lang">{{ lang }}</span>
    </div>
    <pre class="code-block__pre"><code><span v-for="(token, index) in tokens" :key="index" :style="{ color: token.color }">{{ token.text }}</span></code></pre>
  </div>
</template>

<style scoped>
.code-block {
  margin: var(--space-3) 0;
  padding: var(--space-4);
  overflow: hidden;
  background: var(--color-code-bg);
  border-radius: var(--radius-md);
}

.code-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  min-height: var(--space-4);
}

.code-block__lang {
  color: var(--color-code-lang);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.code-block__copy {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--color-code-lang);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  line-height: 1.4;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .code-block__copy:hover {
    color: var(--color-code-text);
  }
}

.code-block__copy:focus-visible {
  outline-color: var(--color-code-text);
}

.code-block__pre {
  margin: 0;
  color: var(--color-code-text);
  font-family: var(--font-mono);
  font-size: calc(var(--rpx) * 26);
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-block__pre code {
  font: inherit;
}
</style>
