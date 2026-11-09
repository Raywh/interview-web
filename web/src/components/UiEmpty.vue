<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: string;
    text?: string;
  }>(),
  {
    icon: '🗂',
    text: '暂无内容',
  },
);
</script>

<template>
  <div class="ui-empty">
    <div v-if="icon" class="ui-empty__icon" aria-hidden="true">{{ icon }}</div>
    <p class="ui-empty__text">{{ text }}</p>
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-7) var(--space-4);
  text-align: center;
}

.ui-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--rpx) * 120);
  height: calc(var(--rpx) * 120);
  margin-bottom: var(--space-4);
  border-radius: 50%;
  background: var(--color-surface-muted);
  font-size: calc(var(--rpx) * 52);
  line-height: 1;
  opacity: 0.85;
}

.ui-empty__text {
  font-size: var(--text-md);
  color: var(--color-text-3);
}
</style>
