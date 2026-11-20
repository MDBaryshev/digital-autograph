import { ultravioletWallStyle } from '../../../lib/wall-design-palettes';
import { WallDesignDemo } from '../../../components/wall-design-demo';
import styles from '../../../components/wall-design-studio.module.css';
import { getTranslator } from '../../../lib/i18n-server';

export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const t = await getTranslator();
  return (
    <main className={styles.page}>
      <h1>{t('Try the Wall Design Studio')}</h1>
      <WallDesignDemo
        initialDesign={{
          title: 'Nova Ray — After Midnight',
          description: t(
            'Ten places for everyone who joined us on tour. Leave your autograph.',
          ),
          avatarDataUrl: null,
          coverDataUrl: null,
          style: {
            ...ultravioletWallStyle,
            finish: 'satin-glass',
            layout: 'podium',
            podium: 'jewels',
            alignment: 'left',
            coverPosition: 'center',
            typeface: 'editorial',
            frame: 'soft',
            event: 'AFTER MIDNIGHT TOUR',
            actionLabel: t('Leave an autograph'),
          },
        }}
      />
    </main>
  );
}
