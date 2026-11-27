import { localizeMetadata } from '../../../lib/i18n-server';

import { getTranslator } from '../../../lib/i18n-server';
import type { Metadata } from 'next';
import styles from '../../recovery-page.module.css';
type AuthErrorPageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

const pageMetadata: Metadata = {
  title: 'Sign-in',
  robots: { index: false, follow: false },
};
export async function generateMetadata() {
  return localizeMetadata(pageMetadata);
}

export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const t = await getTranslator();

  const { code } = await searchParams;
  const messages: Record<string, string> = {
    YANDEX_AUTH_CANCELLED: 'Вход через Яндекс ID отменён.',
    YANDEX_AUTH_FAILED: 'Не удалось завершить вход через Яндекс ID.',
    VK_AUTH_CANCELLED: 'Вход через VK ID отменён.',
    VK_AUTH_FAILED: 'Не удалось завершить вход через VK ID.',
    ALREADY_AUTHENTICATED: 'You are already signed in.',
  };
  const message =
    typeof code === 'string' && Object.hasOwn(messages, code)
      ? (messages[code] ?? 'Sign-in could not be completed.')
      : 'Sign-in could not be completed.';
  const signedIn = code === 'ALREADY_AUTHENTICATED';

  return (
    <main className={styles.page}>
      <h1>
        {t(
          signedIn
            ? 'You are already signed in.'
            : 'Sign-in could not be completed.',
        )}
      </h1>
      {!signedIn && message !== 'Sign-in could not be completed.' && (
        <p>{t(message)}</p>
      )}
      {!signedIn && (
        <p>
          {t(
            'Return to sign-in and try again or choose another sign-in method.',
          )}
        </p>
      )}
      <div className={styles.actions}>
        <a className="primaryLink" href="/me">
          {t(signedIn ? 'Your account' : 'Back to sign-in')}
        </a>
        <a href="/">{t('Return home')}</a>
      </div>
    </main>
  );
}
