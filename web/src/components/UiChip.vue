<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    active?: boolean;
    size?: 'sm' | 'md';
    tappable?: boolean;
  }>(),
  {
    active: false,
    size: 'md',
    tappable: true,
  },
);

const emit = defineEmits<{
  select: [label: string];
}>();

function onSelect(): void {
  if (!props.tappable) return;
  emit('select', props.label);
}
</script>

<template>
  <component
    :is="tappable ? 'button' : 'span'"
    :type="tappable ? 'button' : undefined"
    class="ui-chip"
    :class="[`ui-chip--${size}`, { 'ui-chip--active': active, 'ui-chip--tappable': tappable }]"
    :aria-pressed="tappable ? active : undefined"
    @click="onSelect"
  >
    <span class="ui-chip__text">{{ label }}</span>
  </component>
</template>

<style scoped>
.ui-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  margin: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-2);
  cursor: default;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
}

.ui-chip--md {
  padding: calc(var(--rpx) * 14) var(--space-4);
  margin-right: var(--space-2);
}

.ui-chip--sm {
  padding: calc(var(--rpx) * 6) calc(var(--rpx) * 18);
  margin-right: var(--space-1);
}

.ui-chip__text {
  font-size: var(--text-sm);
  line-height: 1.4;
  white-space: nowrap;
}

.ui-chip--tappable {
  cursor: pointer;
}

.ui-chip--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ui-chip--active .ui-chip__text {
  color: var(--color-on-primary);
  font-weight: 600;
}

@media (hover: hover) {
  .ui-chip--tappable:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .ui-chip--active.ui-chip--tappable:hover {
    background: var(--color-primary-pressed);
    border-color: var(--color-primary-pressed);
    color: var(--color-on-primary);
  }
}

.ui-chip--tappable:active {
  transform: scale(0.94);
}
</style>
