<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  date: string;
}>();

const parsed = computed(() => {
  const date = props.date ? new Date(props.date) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    day: String(valid.getDate()).padStart(2, '0'),
    month: `${valid.getMonth() + 1}月`,
  };
});
</script>

<template>
  <div class="ui-date-block">
    <span class="ui-date-block__day">{{ parsed.day }}</span>
    <span class="ui-date-block__month">{{ parsed.month }}</span>
  </div>
</template>

<style scoped>
.ui-date-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: calc(var(--rpx) * 96);
  padding: calc(var(--rpx) * 14) calc(var(--rpx) * 8);
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.ui-date-block__day {
  font-family: var(--font-serif);
  font-size: var(--date-num-size);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.ui-date-block__month {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-primary);
}
</style>
