import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

export function usePhoneMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  useCloseOnPathnameChange(closeMenu);
  useCloseOnEscape(isMenuOpen, closeMenu);
  useReturnFocusOnClose(isMenuOpen, menuButton);

  return { isMenuOpen, menuButton, toggleMenu, closeMenu };
}

function useCloseOnPathnameChange(closeMenu: () => void) {
  const { pathname } = useLocation();
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    closeMenu();
  }
}

function useCloseOnEscape(isMenuOpen: boolean, closeMenu: () => void) {
  useEffect(() => {
    if (!isMenuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen, closeMenu]);
}

function useReturnFocusOnClose(isMenuOpen: boolean, menuButton: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!isMenuOpen) return;

    const menuButtonElement = menuButton.current;
    return () => menuButtonElement?.focus();
  }, [isMenuOpen, menuButton]);
}
