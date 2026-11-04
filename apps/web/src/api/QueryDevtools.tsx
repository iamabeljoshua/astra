/// <reference types="vite/client" />
import { lazy, Suspense } from 'react';

// False in production, so the build drops the package, and false under Vitest, so tests skip it.
const LazyReactQueryDevtools =
  import.meta.env.MODE === 'development' && import.meta.env.VITE_SCENE_LESSONS !== '1'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => ({ default: ReactQueryDevtools })),
      )
    : null;

export function QueryDevtools() {
  if (!LazyReactQueryDevtools) return null;
  return (
    <Suspense>
      <LazyReactQueryDevtools buttonPosition="top-left" />
    </Suspense>
  );
}
