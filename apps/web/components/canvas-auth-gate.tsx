'use client';
import { useLocale } from './locale-provider';

import { SignInHelp, SignInOptions } from './sign-in-options';

import { useEffect, useState } from 'react';
import { FirstUseGate } from './first-use-gate';
import { CanvasCreateScreen } from './canvas-create-screen';
import styles from './sign-in-options.module.css';

type AuthState = 'checking' | 'authenticated' | 'anonymous' | 'unavailable';

export function CanvasAuthGate({
  apiOrigin,
  wallId,
}: {
  apiOrigin: string;
  wallId?: string;
}) {
  const { t } = useLocale();

  const [auth, setAuth] = useState<AuthState>('checking');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiOrigin}/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.ok) setAuth('authenticated');
        else setAuth(response.status === 401 ? 'anonymous' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuth('unavailable');
      });
    return () => controller.abort();
  }, [apiOrigin, retry]);

  const returnTo = wallId
    ? `/autograph/create?wall=${wallId}`
    : '/autograph/create';
  if (auth === 'checking') return <p role="status">{t('Checking sign-in…')}</p>;
  if (auth === 'authenticated')
    return (
      <FirstUseGate apiOrigin={apiOrigin} loginReturnTo={returnTo}>
        <CanvasCreateScreen apiOrigin={apiOrigin} wallId={wallId} />
      </FirstUseGate>
    );
  if (auth === 'anonymous') {
    return (
      <section className={styles.panel} aria-labelledby="sign-in-heading">
        <h2 id="sign-in-heading">{t('Sign in to continue')}</h2>
        <p>{t('Your autograph creation will start after sign-in.')}</p>
        <SignInOptions apiOrigin={apiOrigin} returnTo={returnTo} />
        <SignInHelp />
        {!wallId && (
          <p>
            <a href="/#try-wall-heading">
              {t('Try drawing without signing in')}
            </a>
          </p>
        )}
      </section>
    );
  }
  return (
    <section role="alert" className={styles.panel}>
      <h2>{t('Sign-in is temporarily unavailable')}</h2>
      <p>{t('Check your connection and try again.')}</p>
      <button
        type="button"
        onClick={() => {
          setAuth('checking');
          setRetry((count) => count + 1);
        }}
      >
        {t('Retry sign-in check')}
      </button>
    </section>
  );
}
