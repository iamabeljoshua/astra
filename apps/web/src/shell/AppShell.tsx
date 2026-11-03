import type { RefObject } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { PRODUCT_NAME, SIDEBAR_LABELS } from '../strings';
import { MENU } from './menu';
import { Sidebar } from './Sidebar';
import { usePhoneMenu } from './usePhoneMenu';

const SIDEBAR_ID = 'sidebar';

export function AppShell() {
  const { isMenuOpen, menuButton, toggleMenu, closeMenu } = usePhoneMenu();

  return (
    <div data-page className="flex min-h-dvh flex-col">
      <title>{PRODUCT_NAME}</title>
      <PhoneHeader isMenuOpen={isMenuOpen} menuButton={menuButton} onToggleMenu={toggleMenu} />
      <div className="flex flex-1">
        <Sidebar id={SIDEBAR_ID} isOpenOnPhone={isMenuOpen} onChoosePage={closeMenu} />
        <main className={`${isMenuOpen ? 'max-md:hidden' : ''} flex min-w-0 flex-1 flex-col px-page-side pt-page-top pb-page-bottom`}>
          <CurrentPage />
        </main>
      </div>
    </div>
  );
}

interface PhoneHeaderProps {
  isMenuOpen: boolean;
  menuButton: RefObject<HTMLButtonElement | null>;
  onToggleMenu: () => void;
}

function PhoneHeader({ isMenuOpen, menuButton, onToggleMenu }: PhoneHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
      <div className="product-mark">{PRODUCT_NAME}</div>
      <button
        ref={menuButton}
        type="button"
        aria-expanded={isMenuOpen}
        aria-controls={SIDEBAR_ID}
        onClick={onToggleMenu}
        className="label -m-2 p-2"
      >
        {SIDEBAR_LABELS.menu}
      </button>
    </header>
  );
}

function CurrentPage() {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="mx-auto flex w-full max-w-column flex-1 animate-arrive flex-col gap-5.5">
      <Routes>
        {MENU.map(({ path, Page }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
