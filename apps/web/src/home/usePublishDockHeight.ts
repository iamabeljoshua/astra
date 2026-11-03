import { useEffect, type RefObject } from 'react';

export function usePublishDockHeight(dock: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    const dockElement = dock.current;
    if (!dockElement) return;

    const dockSize = new ResizeObserver(() => {
      root.style.setProperty('--dock-height', `${Math.ceil(dockElement.getBoundingClientRect().height)}px`);
    });
    dockSize.observe(dockElement);

    return () => {
      dockSize.disconnect();
      root.style.removeProperty('--dock-height');
    };
  }, [dock]);
}
