import type { PageRoute } from '../../router/page-route.js';
import { TodayPage } from './today-page.js';

export const route: PageRoute = {
  path: '/',
  namespace: 'today',
  order: 0,
  Component: TodayPage,
};
