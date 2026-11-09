<script setup lang="ts">
/**
 * 登录页（docs/api.md §1）
 *  - 主入口：GitHub OAuth（`GET /api/auth/github` 直接 302 到 GitHub 授权页）
 *  - 邮箱登录：接口恒返回 501 NOT_IMPLEMENTED（AUTH_EMAIL_ENABLED=false），这里置灰
 *  - 回跳错误：后端失败时 302 到 `/?login=error&reason=<code>`，由 router 转进本页并展示中文提示
 *  - 回调成功固定落在 `/`，所以 next 在跳转前存进 auth store，由 App.vue 补跳
 */
import { computed, onMounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import UiButton from '../components/UiButton.vue';
import UiCard from '../components/UiCard.vue';
import { useAuthStore } from '../stores/auth';

/** 后端可能的 reason 取值（api/src/auth/github.ts 的 loginError 调用点） */
const REASON_TEXT: Record<string, string> = {
  access_denied: '你取消了 GitHub 授权，登录没有完成。',
  missing_code: 'GitHub 没有返回授权码，请重新登录。',
  missing_state: '登录请求缺少校验参数，请重新登录。',
  invalid_state: '登录请求已失效（state 有效期 5 分钟），请重新登录。',
  not_configured: '站点还没有配置 GitHub OAuth（client_id / client_secret），暂时无法登录。',
  token_exchange: '与 GitHub 交换令牌失败，请稍后重试。',
  profile_fetch: '读取 GitHub 账号资料失败，请稍后重试。',
  user_upsert: '保存账号信息失败，请稍后重试。',
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 只接受站内绝对路径，防止 `?next=//evil.com` 这类开放重定向 */
const next = computed<string>(() => {
  const value = route.query.next;
  if (typeof value !== 'string') return '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
});

const errorText = computed<string>(() => {
  if (route.query.login !== 'error') return '';
  const reason = typeof route.query.reason === 'string' ? route.query.reason : '';
  return REASON_TEXT[reason] ?? `登录失败（${reason || '未知原因'}），请重试。`;
});

function loginWithGithub(): void {
  if (next.value) auth.rememberLoginNext(next.value);
  // 契约 §1：GET /api/auth/github 由服务端 302 到 GitHub 授权页
  window.location.href = '/api/auth/github';
}

function goNext(): void {
  void router.push(next.value || '/');
}

function goMe(): void {
  void router.push({ name: 'me' });
}

onMounted(async () => {
  await auth.fetchMe();
  // 已经登录 + 带着回跳目标：直接回到原页面（例如 /login?next=/add）
  if (auth.user && next.value) void router.replace(next.value);
});
</script>

<template>
  <div class="login">
    <section class="login-hero">
      <p class="eyebrow">登录 · 账号</p>
      <h1 class="login-title">登录后<span class="login-title__accent">投稿</span>与评论</h1>
      <p class="login-desc">
        用 GitHub 账号一键登录。投稿与评论都需要登录，内容会先经过审核再公开。
      </p>
    </section>

    <UiCard padding="lg">
      <p v-if="errorText" class="login-error" role="alert">
        <span class="login-error__icon" aria-hidden="true">⚠️</span>
        <span>{{ errorText }}</span>
      </p>

      <template v-if="auth.user">
        <p class="login-current">
          已登录：<strong class="login-current__name">{{ auth.user.name }}</strong>
          <span v-if="auth.isAdmin" class="login-role">管理员</span>
        </p>

        <div class="login-actions">
          <UiButton block size="lg" @click="goNext">继续</UiButton>
          <UiButton variant="ghost" block @click="goMe">我的投稿</UiButton>
        </div>

        <p class="login-hint">要换个账号？在右上角头像里先退出登录。</p>
      </template>

      <template v-else>
        <UiButton block size="lg" :disabled="auth.loading" @click="loginWithGithub">
          用 GitHub 登录
        </UiButton>
        <p v-if="next" class="login-next">
          登录成功后会回到 <code class="login-next__path">{{ next }}</code>
        </p>
        <p class="login-hint">首次登录会自动创建账号；只读取你的公开资料与主邮箱，会话保持 7 天。</p>
      </template>

      <div class="login-divider" aria-hidden="true"><span>或</span></div>

      <div class="login-email" aria-disabled="true">
        <label class="login-email__label" for="login-email">邮箱登录</label>
        <input
          id="login-email"
          class="login-email__input"
          type="email"
          placeholder="you@example.com"
          disabled
        />
        <UiButton variant="ghost" block disabled>发送登录链接</UiButton>
        <p class="login-email__note">需要域名，暂未开放</p>
      </div>
    </UiCard>

    <p class="login-back">
      <RouterLink :to="{ name: 'home' }">← 返回题库</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.login {
  padding-bottom: var(--space-6);
}

/* ---- Hero ---- */
.login-hero {
  padding: var(--space-4) 0 var(--space-5);
  animation: ui-rise-in 0.5s var(--ease-out) backwards;
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: var(--eyebrow-size);
  letter-spacing: 0.26em;
  line-height: 1.4;
}

.login-title {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-1);
  line-height: 1.2;
  letter-spacing: calc(var(--rpx) * 1);
}

.login-title__accent {
  color: var(--color-primary);
  font-weight: var(--accent-weight);
}

.login-desc {
  max-width: calc(var(--rpx) * 540);
  margin-top: var(--space-2);
  color: var(--color-text-2);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
}

/* ---- 错误提示 ---- */
.login-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border-strong);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.login-error__icon {
  flex-shrink: 0;
  line-height: 1.4;
}

/* ---- 已登录 ---- */
.login-current {
  color: var(--color-text-2);
  font-size: var(--text-md);
}

.login-current__name {
  color: var(--color-text-1);
}

.login-role {
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  color: var(--color-primary);
  font-size: var(--text-xs);
}

.login-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.login-hint {
  margin-top: var(--space-3);
  color: var(--color-text-3);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.login-next {
  margin-top: var(--space-2);
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

.login-next__path {
  padding: calc(var(--rpx) * 2) var(--space-1);
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

/* ---- 分隔线 ---- */
.login-divider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-5) 0 var(--space-4);
  color: var(--color-text-3);
  font-size: var(--text-xs);
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

/* ---- 邮箱登录（置灰） ---- */
.login-email {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  opacity: 0.55;
}

.login-email__label {
  color: var(--color-text-2);
  font-size: var(--text-sm);
  font-weight: 600;
}

.login-email__input {
  width: 100%;
  height: var(--input-height);
  padding: 0 var(--space-3);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-3);
  font-family: inherit;
  font-size: var(--text-md);
}

.login-email__input:disabled {
  cursor: not-allowed;
}

.login-email__note {
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

.login-back {
  margin-top: var(--space-5);
  text-align: center;
  color: var(--color-text-3);
  font-size: var(--text-sm);
}

.login-back a {
  transition: color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .login-back a:hover {
    color: var(--color-primary);
  }
}
</style>
