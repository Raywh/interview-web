<script setup lang="ts">
withDefaults(
  defineProps<{
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hoverable?: boolean;
  }>(),
  {
    padding: 'md',
    hoverable: true,
  },
);
</script>

<template>
  <div class="ui-card" :class="[`ui-card--p-${padding}`, { 'ui-card--hoverable': hoverable }]">
    <slot />
  </div>
</template>

<style scoped>
.ui-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition:
    transform var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
  animation: ui-card-in var(--duration-slow) var(--ease-out) backwards;
}

.ui-card--p-none {
  padding: 0;
}

.ui-card--p-sm {
  padding: var(--space-3);
}

.ui-card--p-md {
  padding: var(--space-4);
}

.ui-card--p-lg {
  padding: calc(var(--rpx) * 40);
}

@media (hover: hover) {
  .ui-card--hoverable:hover {
    transform: translateY(calc(var(--rpx) * -3));
    box-shadow: var(--shadow-float);
    border-color: var(--color-border-strong);
  }
}

@keyframes ui-card-in {
  from {
    transform: translateY(calc(var(--rpx) * 16));
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
