<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string;
    title?: string;
    accent?: string;
    desc?: string;
  }>(),
  {
    eyebrow: '',
    title: '',
    accent: '',
    desc: '',
  },
);
</script>

<template>
  <section class="ui-section">
    <header class="ui-section__head">
      <div class="ui-section__titles">
        <p v-if="eyebrow" class="ui-section__eyebrow">{{ eyebrow }}</p>
        <h2 v-if="title || accent" class="ui-section__title">
          <span>{{ title }}</span><span v-if="accent" class="ui-section__accent">{{ accent }}</span>
        </h2>
        <p v-if="desc" class="ui-section__desc">{{ desc }}</p>
      </div>
      <div v-if="$slots.extra" class="ui-section__extra">
        <slot name="extra" />
      </div>
    </header>
    <div class="ui-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ui-section {
  min-width: 0;
}

.ui-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.ui-section__titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ui-section__eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: var(--eyebrow-size);
  letter-spacing: 0.26em;
  line-height: 1.4;
}

.ui-section__title {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: var(--leading-tight);
}

.ui-section__accent {
  color: var(--color-primary);
  font-weight: var(--accent-weight);
}

.ui-section__desc {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-3);
}

.ui-section__extra {
  flex-shrink: 0;
}

.ui-section__body {
  min-width: 0;
}
</style>
