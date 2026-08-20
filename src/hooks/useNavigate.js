import { useState, useCallback, useEffect } from 'react';

/**
 * Simple hash router (no react-router dependency)
 * Usage:
 *   const [route, nav] = useNavigate();
 *   nav('/login');
 */
export function useNavigate() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to, replace = false) => {
    const path = to.startsWith('#') ? to.slice(1) : to;
    if (replace) {
      window.history.replaceState(null, '', '#' + path);
      setRoute(path);
    } else {
      window.location.hash = path;
    }
  }, []);

  return [route, navigate];
}

export const parseRoute = (route) => {
  const [path] = route.split('?');
  const segments = path.split('/').filter(Boolean);
  return segments;
};
