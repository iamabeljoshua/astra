import type { ComponentType } from 'react';
import { MENU_LABELS } from '../strings';
import { EmptyHomePage } from './EmptyHomePage';
import { EmptySessionsPage } from './EmptySessionsPage';

interface MenuItem {
  path: string;
  label: string;
  Page: ComponentType;
}

export const MENU: MenuItem[] = [
  { path: '/', label: MENU_LABELS.home, Page: EmptyHomePage },
  { path: '/sessions', label: MENU_LABELS.sessions, Page: EmptySessionsPage },
];
