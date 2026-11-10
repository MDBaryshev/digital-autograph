import { getTranslator } from '../../lib/i18n-server';
import { loadWebConfig } from '@digital-autograph/config';
import { ModerationSections } from '../../components/profile-moderation-workspace';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const t = await getTranslator();

  const { API_PUBLIC_ORIGIN } = loadWebConfig();
  return (
    <main className={styles.page}>
      <h1>{t('Content moderation')}</h1>
      <p>{t('Review submitted profiles and autographs before publication.')}</p>
      <ModerationSections apiOrigin={API_PUBLIC_ORIGIN} />
    </main>
  );
}
