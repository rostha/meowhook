'use client';

import { useRouter } from 'next/navigation';

export default function DocsBackButton({
  className,
  label = 'Back to Meowhook',
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.history.length > 1 && document.referrer) {
          try {
            const referrerUrl = new URL(document.referrer);
            const currentUrl = new URL(window.location.href);
            const sameOrigin = referrerUrl.origin === currentUrl.origin;
            const referrerIsDocs = referrerUrl.pathname.startsWith('/docs');
            if (sameOrigin && !referrerIsDocs) {
              router.back();
              return;
            }
          } catch {
            // Fall through to the safe home route.
          }
        }
        router.push('/');
      }}
    >
      {label}
    </button>
  );
}
