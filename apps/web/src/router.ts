import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'notes', component: () => import('./views/NotesView.vue') },
  { path: '/search', name: 'search', component: () => import('./views/NotesView.vue'), props: { focusSearch: true } },
  { path: '/graph', name: 'graph', component: () => import('./views/GraphView.vue') },
  { path: '/ai', name: 'ai', component: () => import('./views/AiView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
