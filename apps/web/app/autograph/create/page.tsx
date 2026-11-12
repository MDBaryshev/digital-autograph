import { localizeMetadata } from '../../../lib/i18n-server';

import { getTranslator } from '../../../lib/i18n-server';
import type { Metadata } from 'next';
import { loadWebConfig } from '@digital-autograph/config';
import { CanvasAuthGate } from '../../../components/canvas-auth-gate';
import styles from './page.module.css';
import { wallIdParams } from '@digital-autograph/contracts';
import { Icon } from '../../../components/ui-icon';

const pageMetadata: Metadata = {
  title: 'Create a digital autograph',
  robots: { index: false, follow: false },
};
export async function generateMetadata() {
  return localizeMetadata(pageMetadata);
}

export const dynamic = 'force-dynamic';

export default async function CreateAutographPage({
  searchParams,
}: {
  searchParams: Promise<{ wall?: string | string[] }>;
}) {
  const t = await getTranslator();

  const { API_PUBLIC_ORIGIN } = loadWebConfig();
  const wall = wallIdParams.safeParse({ id: (await searchParams).wall });
  const wallId = wall.success ? wall.data.id : undefined;
  return (
    <main className={styles.page}>
      {wallId && (
        <a className={styles.back} href={`/walls/${wallId}`}>
          {t('Back to the Wall')}
        </a>
      )}
      <h1>{t('Create a digital autograph')}</h1>
      <p className={styles.intro}>
        {t(
          'Draw an autograph or upload a photo, then check the private preview before sending it for moderation.',
        )}
      </p>
      <aside className={styles.warning}>
        <Icon name="lock" size={17} />
        <span>
          {t(
            'The approved autograph can become public when you place it on a Wall. Do not use a bank, legal or other sensitive signature.',
          )}
        </span>
      </aside>
      <CanvasAuthGate apiOrigin={API_PUBLIC_ORIGIN} wallId={wallId} />
    </main>
  );
}
