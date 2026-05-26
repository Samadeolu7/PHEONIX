import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Minimal compatibility for `import { useRouter } from 'next/router'`
 * Exposes: push, replace, pathname, query, asPath, back
 */
export function useRouter() {
  const navigate = useNavigate();
  const location = useLocation();

  const push = (to, opts) => {
    if (typeof to === 'object' && to.pathname) {
      // support push({ pathname, query })
      const qs = to.query
        ? '?' + new URLSearchParams(to.query).toString()
        : '';
      return navigate(`${to.pathname}${qs}`, { replace: !!opts?.replace });
    }
    return navigate(to, { replace: !!opts?.replace });
  };

  const replace = (to) => navigate(to, { replace: true });

  const query = Object.fromEntries(new URLSearchParams(location.search));

  return {
    push,
    replace,
    pathname: location.pathname,
    query,
    asPath: location.pathname + location.search,
    back: () => window.history.back(),
  };
}

// default export to match `import { useRouter } from 'next/router'` usage
export default useRouter;
