<script setup lang="ts">
import { computed } from 'vue';

/**
 * 分类色标 —— 替代原先的日期块。
 *
 * 背景：导入的 144 条历史题 `createdTime` 完全相同，列表上每张卡都是「15 / 8月」，
 * 既无信息量又显得像 bug。改成按分类取色的标记，视觉上保留博客式的左侧锚点。
 */
const props = defineProps<{
  category: string;
  size?: 'sm' | 'md';
}>();

/** 8 个色相，见 styles/tokens.css 的 --color-cat-* */
const PALETTE = [
  '--color-cat-1',
  '--color-cat-2',
  '--color-cat-3',
  '--color-cat-4',
  '--color-cat-5',
  '--color-cat-6',
  '--color-cat-7',
  '--color-cat-8',
] as const;

/** 稳定哈希：同一分类永远同一颜色 */
function hashCategory(value: string): number {
  let hash = 0;
  for (const ch of value) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

const colorVar = computed(() => `var(${PALETTE[hashCategory(props.category) % PALETTE.length]})`);
const label = computed(() => Array.from(props.category)[0] ?? '题');
const sizeClass = computed(() => (props.size === 'sm' ? 'category-mark--sm' : ''));
</script>

<template>
  <div
    class="category-mark"
    :class="sizeClass"
    :style="{ '--mark-color': colorVar }"
    :title="category"
    :aria-label="category"
  >
    <span class="category-mark__char">{{ label }}</span>
  </div>
</template>

<style scoped>
.category-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: calc(var(--rpx) * 96);
  height: calc(var(--rpx) * 96);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--mark-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--mark-color) 28%, transparent);
}

.category-mark--sm {
  width: calc(var(--rpx) * 72);
  height: calc(var(--rpx) * 72);
}

.category-mark__char {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1;
  color: var(--mark-color);
}

.category-mark--sm .category-mark__char {
  font-size: var(--text-md);
}
</style>
