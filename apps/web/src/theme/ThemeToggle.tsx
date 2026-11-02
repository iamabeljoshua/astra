import { useState } from 'react';
import { THEME_LABELS } from '../strings';
import { chooseTheme, getAppliedTheme, THEMES, type Theme } from './theme';

export function ThemeToggle() {
  const [appliedTheme, setAppliedTheme] = useState(getAppliedTheme);

  function switchTo(theme: Theme) {
    chooseTheme(theme);
    setAppliedTheme(theme);
  }

  return (
    <div role="group" aria-label={THEME_LABELS.appearance} className="inline-flex flex-none border border-line">
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          aria-pressed={appliedTheme === theme}
          onClick={() => switchTo(theme)}
          className="px-2.25 py-1 text-label font-medium text-ink-2 aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {THEME_LABELS[theme]}
        </button>
      ))}
    </div>
  );
}
