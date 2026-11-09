<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const router = useRouter();

onMounted(async () => {
  // 头部导航已发起同一个请求（store 内部去重），这里等结果出来再决定要不要补跳
  await auth.fetchMe();
  if (!auth.user) return;

  // OAuth 回调固定落在 '/'，拿不到原页面的 next，只能靠跳登录前存下的目标补一次
  const next = auth.takeLoginNext();
  if (next) await router.replace(next);
});
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <!-- 列表页缓存：从详情返回时保留分类筛选 / 已加载页数（等价小程序的 navigateBack） -->
    <RouterView v-slot="{ Component }">
      <KeepAlive include="HomeView">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </div>
</template>
