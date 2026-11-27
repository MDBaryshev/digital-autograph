import { loadWebConfig } from '@digital-autograph/config';
import { WallDesignStudio } from '../../../../../components/wall-design-studio';
import styles from '../../../../../components/wall-design-studio.module.css';
import { getTranslator } from '../../../../../lib/i18n-server';
import { wallDesignTemplatesPath } from '../../../../../lib/wall-design-links';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const t = await getTranslator();
  return (
    <main className={styles.page}>
      <h1>{t('Wall templates')}</h1>
      <WallDesignStudio
        apiOrigin={loadWebConfig().API_PUBLIC_ORIGIN}
        mode="admin"
        path={wallDesignTemplatesPath}
      />
    </main>
  );
}
