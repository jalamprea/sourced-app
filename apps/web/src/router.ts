import { useCallback, useEffect, useState } from 'react';

/**
 * Two routes do not justify a router dependency. `pushState` plus a `popstate` listener
 * covers forward navigation and the browser back button, which is all this needs.
 *
 * Deep-linking to /acerca-de works because both the Vite dev server and the Render
 * static site rewrite unknown paths to index.html.
 */
export function useRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: string) => {
    if (next === window.location.pathname) return;
    // Keep ?coach= when it is there: it is the stage deep link.
    window.history.pushState({}, '', `${next}${window.location.search}`);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);

  return [path, navigate];
}
