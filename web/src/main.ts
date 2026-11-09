import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/tokens.css';
import './styles/global.css';
import './styles/markdown.css';

// pinia 必须先于 router 安装：路由守卫里会 useAuthStore()
createApp(App).use(createPinia()).use(router).mount('#app');
