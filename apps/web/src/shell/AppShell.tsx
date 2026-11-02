import { useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { PRODUCT_NAME, SIDEBAR_LABELS } from '../strings';
import { MENU } from './menu';
import { Sidebar } from './Sidebar';

const SIDEBAR_ID = 'sidebar';

export function AppShell() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  function closeMenu() {
    if (!isMenuOpen) return;
    setIsMenuOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div
      className="flex min-h-dvh flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeMenu();
      }}
    >
      <title>{PRODUCT_NAME}</title>
      <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
        <div className="product-mark">{PRODUCT_NAME}</div>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls={SIDEBAR_ID}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="label -m-2 p-2"
        >
          {SIDEBAR_LABELS.menu}
        </button>
      </header>
      <div className="flex flex-1">
        <Sidebar id={SIDEBAR_ID} isOpenOnPhone={isMenuOpen} onChoosePage={closeMenu} />
        <main className={`${isMenuOpen ? 'max-md:hidden' : ''} min-w-0 flex-1 px-page-side pt-page-top pb-7`}>
          <CurrentPage />
        </main>
      </div>
    </div>
  );
}

function CurrentPage() {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="mx-auto flex max-w-column animate-arrive flex-col gap-5.5">
      <Routes>
        {MENU.map(({ path, Page }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
