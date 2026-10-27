'use client';

import { useEffect } from 'react';

export default function DocsRouteEffects() {
  useEffect(() => {
    document.documentElement.classList.add('docs-route');
    document.body.classList.add('docs-route');

    return () => {
      document.documentElement.classList.remove('docs-route');
      document.body.classList.remove('docs-route');
    };
  }, []);

  return null;
}
