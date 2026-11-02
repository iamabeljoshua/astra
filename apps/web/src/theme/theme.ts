export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

const THEME_STORAGE_KEY = 'theme';

export function getAppliedTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function chooseTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked storage only loses the saved choice.
  }
}
