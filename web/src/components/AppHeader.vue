<script setup lang="ts">
/**
 * 顶部导航：站点名 + 首页 / 投稿 / 审核台 + 登录按钮或头像下拉。
 * - 移动端（≤640px）导航收进「☰」折叠面板，账号区仍常驻。
 * - 登录态来自 auth store；未登录时 401 被 store 吞掉，这里只渲染「登录」。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import UiAvatar from './UiAvatar.vue';
import UiButton from './UiButton.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const menuOpen = ref(false);
const userMenuOpen = ref(false);
const userMenuEl = ref<HTMLElement | null>(null);

/** 审核台入口只对 admin 展示；非 admin 直接访问 /admin 仍会看到「无权访问」 */
const showAdminEntry = computed<boolean>(() => auth.isAdmin);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) userMenuOpen.value = false;
}

function toggleUserMenu(): void {
  userMenuOpen.value = !userMenuOpen.value;
  if (userMenuOpen.value) menuOpen.value = false;
}

function closeAll(): void {
  menuOpen.value = false;
  userMenuOpen.value = false;
}

function goLogin(): void {
  closeAll();
  void router.push({ name: 'login' });
}

async function onLogout(): Promise<void> {
  closeAll();
  await auth.logout();
  // 当前页面需要登录时（如 /me、/admin），退出后回首页，避免停在无权内容上
  if (route.meta.requiresAuth) void router.replace({ name: 'home' });
}

function onDocumentClick(event: MouseEvent): void {
  if (!userMenuOpen.value) return;
  const el = userMenuEl.value;
  if (el && event.target instanceof Node && el.contains(event.target)) return;
  userMenuOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeAll();
}

onMounted(() => {
  void auth.fetchMe();
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});

watch(
  () => route.fullPath,
  () => {
    closeAll();
  },
);
</script>

<template>
  <header class="app-header">
    <div class="app-header__bar">
      <RouterLink class="brand" :to="{ name: 'home' }" @click="closeAll">
        <span class="brand__name">前端<span class="brand__accent">面试题库</span></span>
      </RouterLink>

      <nav class="app-header__nav" aria-label="主导航">
        <RouterLink class="nav-link" :to="{ name: 'home' }">首页</RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'add' }">投稿</RouterLink>
        <RouterLink v-if="showAdminEntry" class="nav-link" :to="{ name: 'admin' }">审核台</RouterLink>
      </nav>

      <div class="app-header__actions">
        <div v-if="auth.user" ref="userMenuEl" class="user-menu">
          <button
            type="button"
            class="user-menu__trigger"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click="toggleUserMenu"
          >
            <UiAvatar :src="auth.user.avatarUrl" :name="auth.user.name" size="sm" />
            <span class="user-menu__name">{{ auth.user.name }}</span>
            <span class="user-menu__caret" aria-hidden="true">▾</span>
          </button>

          <div v-if="userMenuOpen" class="user-menu__panel" role="menu">
            <p class="user-menu__meta">{{ auth.isAdmin ? '管理员' : '已登录' }}</p>
            <RouterLink
              class="user-menu__item"
              role="menuitem"
              :to="{ name: 'me' }"
              @click="closeAll"
            >
              我的投稿
            </RouterLink>
            <button
              type="button"
              class="user-menu__item user-menu__item--danger"
              role="menuitem"
              @click="onLogout"
            >
              退出登录
            </button>
          </div>
        </div>

        <UiButton v-else-if="auth.fetched" variant="ghost" class="app-header__login" @click="goLogin">
          登录
        </UiButton>

        <button
          type="button"
          class="app-header__toggle"
          :aria-expanded="menuOpen"
          aria-label="展开导航"
          @click="toggleMenu"
        >
          <span aria-hidden="true">{{ menuOpen ? '✕' : '☰' }}</span>
        </button>
      </div>
    </div>

    <nav v-if="menuOpen" class="app-header__mobile" aria-label="移动导航">
      <RouterLink class="mobile-link" :to="{ name: 'home' }" @click="closeAll">首页</RouterLink>
      <RouterLink class="mobile-link" :to="{ name: 'add' }" @click="closeAll">投稿</RouterLink>
      <RouterLink v-if="showAdminEntry" class="mobile-link" :to="{ name: 'admin' }" @click="closeAll">
        审核台
      </RouterLink>
      <RouterLink v-if="auth.user" class="mobile-link" :to="{ name: 'me' }" @click="closeAll">
        我的投稿
      </RouterLink>
      <button
        v-if="auth.user"
        type="button"
        class="mobile-link mobile-link--danger"
        @click="onLogout"
      >
        退出登录
      </button>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: calc(var(--page-padding) * -1) calc(var(--page-padding) * -1) var(--space-4);
  padding: 0 var(--page-padding);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.app-header__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: calc(var(--rpx) * 100);
}

/* ---- 站点名 ---- */
.brand {
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
}

.brand__name {
  color: var(--color-text-1);
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: calc(var(--rpx) * 1);
  line-height: 1.2;
}

.brand__accent {
  color: var(--color-primary);
  font-weight: var(--accent-weight);
}

/* ---- 桌面导航 ---- */
.app-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.nav-link {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: 1.4;
  white-space: nowrap;
  transition:
    color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.nav-link.router-link-active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

@media (hover: hover) {
  .nav-link:hover {
    color: var(--color-primary);
  }
}

/* ---- 账号区 ---- */
.app-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.user-menu {
  position: relative;
}

.user-menu__trigger {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: calc(var(--rpx) * 4);
  padding-right: var(--space-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .user-menu__trigger:hover {
    border-color: var(--color-border);
  }
}

.user-menu__name {
  max-width: calc(var(--rpx) * 180);
  overflow: hidden;
  color: var(--color-text-2);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__caret {
  color: var(--color-text-3);
  font-size: var(--text-xs);
  line-height: 1;
}

.user-menu__panel {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 30;
  min-width: calc(var(--rpx) * 260);
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
}

.user-menu__meta {
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

.user-menu__item {
  display: block;
  width: 100%;
  padding: var(--space-2);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .user-menu__item:hover {
    background: var(--color-bg-soft);
    color: var(--color-primary);
  }
}

.user-menu__item--danger {
  color: var(--color-danger);
}

/* ---- 折叠按钮 / 移动面板 ---- */
.app-header__toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--input-height);
  height: var(--input-height);
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: 1;
  cursor: pointer;
}

.app-header__mobile {
  display: flex;
  flex-direction: column;
  gap: calc(var(--rpx) * 2);
  padding-bottom: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.mobile-link {
  display: block;
  width: 100%;
  padding: var(--space-2);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}

.mobile-link.router-link-active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

.mobile-link--danger {
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .app-header__nav {
    display: none;
  }

  .app-header__toggle {
    display: inline-flex;
  }

  .user-menu__name {
    display: none;
  }
}

@media (min-width: 641px) {
  .app-header__mobile {
    display: none;
  }
}
</style>
