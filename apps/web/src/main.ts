import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';
import './iconify';
import './styles/index.css';
import { initTheme } from './composables/useTheme';

// Apply the persisted theme before mount so CSS variables resolve correctly
// on first paint.
initTheme();

createApp(App).use(createPinia()).use(router).mount('#app');
