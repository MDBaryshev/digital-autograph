'use client';

import { EmailSignIn } from './email-sign-in';
import { useLocale } from './locale-provider';
import { VkIdSignIn } from './vk-id-sign-in';
import { YandexSignIn } from './yandex-sign-in';
import styles from './sign-in-options.module.css';

export function SignInOptions({
  apiOrigin,
  returnTo,
}: {
  apiOrigin: string;
  returnTo: string;
}) {
  const { t } = useLocale();
  const destination = encodeURIComponent(returnTo);

  return (
    <div className={styles.options}>
      <a href={`${apiOrigin}/auth/google/start?returnTo=${destination}`}>
        {t('Continue with Google')}
      </a>
      <a href={`${apiOrigin}/auth/telegram/start?returnTo=${destination}`}>
        {t('Continue with Telegram')}
      </a>
      <YandexSignIn apiOrigin={apiOrigin} returnTo={returnTo} />
      <VkIdSignIn apiOrigin={apiOrigin} returnTo={returnTo} />
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
