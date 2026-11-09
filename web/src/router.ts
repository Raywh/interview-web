import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import DetailView from './views/DetailView.vue';
import LoginView from './views/LoginView.vue';
import AddView from './views/AddView.vue';
import AdminView from './views/AdminView.vue';
import MeView from './views/MeView.vue';
import { useAuthStore } from './stores/auth';

const SITE_TITLE = '前端面试题库';

declare module 'vue-router' {
  interface RouteMeta {
    /** 写进 document.title 的页面名（首页不拼前缀） */
    title?: string;
    /** 需要登录：未登录跳 /login?next=<path> */
    requiresAuth?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: '' },
    },
    {
      path: '/q/:id',
      name: 'detail',
      component: DetailView,
      meta: { title: '题目详情' },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { title: '登录' },
    },
    {
      path: '/add',
      name: 'add',
      component: AddView,
      meta: { title: '投稿', requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { title: '审核台', requiresAuth: true },
    },
    {
      path: '/me',
      name: 'me',
      component: MeView,
      meta: { title: '我的投稿', requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

/**
 * 契约 §1：OAuth 失败时后端 302 到 `/?login=error&reason=<code>`（落到首页）。
 * 这里统一转交给登录页展示中文原因——LoginView 是错误文案的唯一出口。
 */
router.beforeEach((to) => {
  if (to.name === 'home' && to.query.login === 'error') {
    return { name: 'login', query: { login: 'error', reason: to.query.reason ?? '' } };
  }
  return true;
});

/** 登录守卫：/add、/admin、/me 需要登录，未登录跳 /login?next=<path> */
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  const auth = useAuthStore();
  await auth.fetchMe();
  if (!auth.user) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${SITE_TITLE}` : SITE_TITLE;
});
