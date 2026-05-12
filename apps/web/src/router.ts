import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'notes', component: () => import('./views/NotesView.vue') },
  { path: '/graph', name: 'graph', component: () => import('./views/GraphView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  // Database View (Notion-class table). `:viewId` is optional — when omitted
  // the page resolves to the kind's default view server-side.
  { path: '/k/:kindId', name: 'database-view', component: () => import('./views/DatabaseViewPage.vue') },
  { path: '/k/:kindId/:viewId', name: 'database-view-saved', component: () => import('./views/DatabaseViewPage.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
