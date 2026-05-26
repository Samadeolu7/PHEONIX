import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Minimal compatibility for `import Link from 'next/link'`.
 * - Accepts href prop (string)
 * - Forwards className/children and other props onto react-router Link
 * - Keeps anchor semantics (renders <a> inside)
 */
export default function Link({ href, children, ...rest }) {
  // react-router's Link accepts `to`
  // keep behavior forgiving for cases where people passed legacy next props
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}
