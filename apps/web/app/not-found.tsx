import { getTranslator } from '../lib/i18n-server';
import styles from './recovery-page.module.css';
export default async function NotFound() {
  const t = await getTranslator();

  return (
    <main className={styles.page}>
      <h1>{t('Page not found')}</h1>
      <p>
        {t('This page may no longer be public, or the link may be incorrect.')}
      </p>
      <div className={styles.actions}>
        <a className="primaryLink" href="/">
          {t('Return home')}
        </a>
      </div>
    </main>
  );
}
