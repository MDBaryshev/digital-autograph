import { loadWebConfig } from '@digital-autograph/config';
import { WallFeedScreen } from '../../components/wall-feed';
import styles from '../../components/wall-feed.module.css';
import { getTranslator } from '../../lib/i18n-server';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const t = await getTranslator();
  const mode =
    (await searchParams).view === 'following' ? 'following' : 'for-you';
  const { API_PUBLIC_ORIGIN } = loadWebConfig();

  return (
    <main className={styles.page}>
      <h1>{t('Wall feed')}</h1>
      <p className={styles.intro}>
        {t('Discover Walls and keep up with the creators you follow.')}
      </p>
      <nav className={styles.tabs} aria-label={t('Feed views')}>
        <a href="/feed" aria-current={mode === 'for-you' ? 'page' : undefined}>
          {t('For you')}
        </a>
        <a
          href="/feed?view=following"
          aria-current={mode === 'following' ? 'page' : undefined}
        >
          {t('Following')}
        </a>
      </nav>
      <WallFeedScreen key={mode} mode={mode} apiOrigin={API_PUBLIC_ORIGIN} />
    </main>
  );
}
