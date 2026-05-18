import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'notes', component: () => import('./views/NotesView.vue') },
  { path: '/graph', name: 'graph', component: () => import('./views/GraphView.vue') },
  {
    path: '/databases',
    name: 'databases',
    component: () => import('./views/DatabasesView.vue'),
  },
  {
    path: '/templates',
    name: 'templates',
    component: () => import('./views/TemplatesView.vue'),
  },
  {
    path: '/templates/:id',
    name: 'template-edit',
    component: () => import('./views/TemplatesView.vue'),
    props: true,
  },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
