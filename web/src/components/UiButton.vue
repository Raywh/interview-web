<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'plain';
    size?: 'md' | 'lg';
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    block: false,
    loading: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  click: [];
}>();

function onClick(): void {
  if (props.loading || props.disabled) return;
  emit('click');
}
</script>

<template>
  <button
    type="button"
    class="ui-btn"
    :class="[
      `ui-btn--${variant}`,
      `ui-btn--${size}`,
      { 'ui-btn--block': block, 'ui-btn--disabled': disabled || loading },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="onClick"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  box-sizing: border-box;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out),
    opacity var(--duration-fast) var(--ease-out);
}

.ui-btn--md {
  height: var(--input-height);
  padding: 0 var(--space-4);
  font-size: var(--text-md);
}

.ui-btn--lg {
  height: var(--input-height);
  padding: 0 var(--space-5);
  font-size: var(--text-lg);
}

.ui-btn--block {
  display: flex;
  width: 100%;
}

.ui-btn--primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
  box-shadow: 0 calc(var(--rpx) * 6) calc(var(--rpx) * 18) var(--color-primary-glow);
}

.ui-btn--ghost {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text-2);
}

.ui-btn--plain {
  background: transparent;
  border-color: transparent;
  color: var(--color-primary);
  box-shadow: none;
}

@media (hover: hover) {
  .ui-btn--primary:hover {
    background: var(--color-primary-pressed);
    transform: translateY(calc(var(--rpx) * 2));
  }

  .ui-btn--ghost:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .ui-btn--plain:hover {
    color: var(--color-primary-pressed);
  }
}

.ui-btn:active {
  transform: translateY(calc(var(--rpx) * 1));
}

.ui-btn--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.ui-btn__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ui-btn-spin 0.7s linear infinite;
}

@keyframes ui-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
