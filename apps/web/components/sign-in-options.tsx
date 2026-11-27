'use client';

import { useLocale } from './locale-provider';
import { EmailSignIn } from './email-sign-in';
import { YandexSignIn } from './yandex-sign-in';
import styles from './sign-in-options.module.css';

export function SignInOptions({
  apiOrigin,
  returnTo,
}: {
  apiOrigin: string;
  returnTo: string;
}) {
  return (
    <div className={styles.options}>
      <YandexSignIn apiOrigin={apiOrigin} returnTo={returnTo} />
      <EmailSignIn apiOrigin={apiOrigin} returnTo={returnTo} />
    </div>
  );
}

export function SignInHelp() {
  const { t } = useLocale();
  return (
    <details className={styles.help}>
      <summary>{t('Trouble signing in?')}</summary>
      <p>
        {t(
          'If sign-in cannot open inside this app, open this page in Safari or Chrome and try again.',
        )}
      </p>
    </details>
  );
}
