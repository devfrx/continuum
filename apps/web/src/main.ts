import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';
import './iconify';
import './styles/index.css';
import { initTheme } from './composables/useTheme';

// Apply persisted theme before mount to avoid a flash of incorrect colors.
initTheme();

createApp(App).use(createPinia()).use(router).mount('#app');
