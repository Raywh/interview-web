/**
 * 登录态 store（Pinia）。
 *
 * 口径（docs/api.md §1）：
 *  - `GET /api/auth/me` 未登录返回 401 UNAUTHORIZED —— 这是**常态**，不当作错误上报，
 *    只把 user 置空，页面继续渲染「未登录」形态。
 *  - 网络失败同样降级成未登录，避免头部导航 / 路由守卫被一次失败请求卡死。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { getMe, logout as logoutRequest } from '../api/endpoints';
import type { AuthUser } from '../api/endpoints';

/**
 * OAuth 回调成功后后端 302 到 APP_ORIGIN（固定是 `/`），拿不到原页面的 next，
 * 所以在跳 GitHub 之前先用 sessionStorage 存一次，回到站内后再补跳。
 * 只存站内路径，避免开放重定向。
 */
const LOGIN_NEXT_KEY = 'interview:login-next';

function isSafeNext(target: string): boolean {
  return target.startsWith('/') && !target.startsWith('//');
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  /** 是否已向服务端确认过登录态（避免每次导航都打一次 /auth/me） */
  const fetched = ref(false);

  const isAdmin = computed<boolean>(() => user.value?.role === 'admin');
  const isLoggedIn = computed<boolean>(() => user.value !== null);

  let inflight: Promise<void> | null = null;

  function load(force: boolean): Promise<void> {
    if (inflight) return inflight;
    if (fetched.value && !force) return Promise.resolve();

    loading.value = true;
    const task = (async () => {
      try {
        user.value = await getMe();
      } catch {
        // 401 → 未登录；网络 / 解析失败 → 同样按未登录处理（不抛给调用方）
        user.value = null;
      } finally {
        fetched.value = true;
        loading.value = false;
        inflight = null;
      }
    })();

    inflight = task;
    return task;
  }

  /** 拉取当前用户；已拉过则直接复用结果（并发调用共享同一个请求） */
  function fetchMe(): Promise<void> {
    return load(false);
  }

  /** 强制重新拉取（登录 / 退出后用） */
  function refresh(): Promise<void> {
    return load(true);
  }

  async function logout(): Promise<void> {
    try {
      await logoutRequest();
    } catch {
      // cookie 已过期 / 网络失败：本地态照样清掉，界面回到未登录
    }
    user.value = null;
    fetched.value = true;
  }

  /** 记住登录后要回到的站内路径（跳 GitHub 前调用） */
  function rememberLoginNext(target: string): void {
    if (!isSafeNext(target)) return;
    try {
      window.sessionStorage.setItem(LOGIN_NEXT_KEY, target);
    } catch {
      // 隐私模式 / 存储被禁：忽略，只是少一次回跳
    }
  }

  /** 取走并清空回跳目标 */
  function takeLoginNext(): string {
    let target = '';
    try {
      target = window.sessionStorage.getItem(LOGIN_NEXT_KEY) ?? '';
      window.sessionStorage.removeItem(LOGIN_NEXT_KEY);
    } catch {
      target = '';
    }
    return isSafeNext(target) ? target : '';
  }

  return {
    user,
    loading,
    fetched,
    isAdmin,
    isLoggedIn,
    fetchMe,
    refresh,
    logout,
    rememberLoginNext,
    takeLoginNext,
  };
});
