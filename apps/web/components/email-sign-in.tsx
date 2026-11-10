'use client';

import { useEffect, useState } from 'react';
import { useLocale } from './locale-provider';

export function EmailSignIn({
  apiOrigin,
  returnTo,
}: {
  apiOrigin: string;
  returnTo: string;
}) {
  const { t } = useLocale();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setAvailable(false);
    void (async () => {
      try {
        const response = await fetch(`${apiOrigin}/auth/providers`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const providers: unknown = await response.json();
        if (
          !controller.signal.aborted &&
          providers &&
          typeof providers === 'object' &&
          'email' in providers
        ) {
          setAvailable(providers.email === true);
        }
      } catch {
        // Availability stays off if the API cannot confirm it.
      }
    })();
    return () => controller.abort();
  }, [apiOrigin]);

  if (!available) return null;
  return (
    <a href={`/auth/email?returnTo=${encodeURIComponent(returnTo)}`}>
      {t('Continue with email')}
    </a>
  );
}
