<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src?: string | null;
    name?: string;
    size?: 'sm' | 'md';
  }>(),
  {
    src: null,
    name: '',
    size: 'sm',
  },
);

const failed = ref(false);

const initial = computed(() => {
  const first = Array.from(props.name.trim())[0];
  return first ?? '匿';
});

const showImage = computed(() => Boolean(props.src) && !failed.value);

watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <div class="ui-avatar" :class="`ui-avatar--${size}`">
    <img
      v-if="showImage"
      class="ui-avatar__img"
      :src="src ?? ''"
      :alt="name"
      @error="failed = true"
    />
    <span v-else class="ui-avatar__text" aria-hidden="true">{{ initial }}</span>
  </div>
</template>

<style scoped>
.ui-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--color-bg-soft);
  color: var(--color-primary);
  font-weight: 600;
}

.ui-avatar--sm {
  width: calc(var(--rpx) * 56);
  height: calc(var(--rpx) * 56);
  font-size: var(--text-sm);
}

.ui-avatar--md {
  width: calc(var(--rpx) * 72);
  height: calc(var(--rpx) * 72);
  font-size: var(--text-md);
}

.ui-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ui-avatar__text {
  line-height: 1;
}
</style>
