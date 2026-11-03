import type { ComponentType } from 'react';
import { HomeScreen } from '../home/HomeScreen';
import { SessionsPage } from '../sessions/SessionsPage';
import { MENU_LABELS } from '../strings';

interface MenuItem {
  path: string;
  label: string;
  Page: ComponentType;
}

export const MENU: MenuItem[] = [
  { path: '/', label: MENU_LABELS.home, Page: HomeScreen },
  { path: '/sessions', label: MENU_LABELS.sessions, Page: SessionsPage },
];
