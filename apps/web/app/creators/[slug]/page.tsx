import { getTranslator } from '../../../lib/i18n-server';
import type { Metadata } from 'next';
import { cache } from 'react';
import { loadWebConfig } from '@digital-autograph/config';
import { creatorSlugParams } from '@digital-autograph/contracts';
import { notFound } from 'next/navigation';
import { getPublicCreator } from '../../../lib/public-creator-api';
import { PublicWallApiError } from '../../../lib/public-wall-api';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
const loadCreator = cache(async (slug: string) => {
  const { API_INTERNAL_URL } = loadWebConfig();
  return getPublicCreator(API_INTERNAL_URL, slug);
});
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslator();
  const parsed = creatorSlugParams.safeParse(await params);
  if (!parsed.success)
    return { title: t('Creator not found'), robots: { index: false } };
  try {
    const creator = await loadCreator(parsed.data.slug);
    const title = t('{name} — public Wall', { name: creator.displayName });
    const description = t('Explore {name}’s digital autograph Wall.', {
      name: creator.displayName,
    });
    return {
      title,
      description,
      openGraph: { title, description, type: 'website' },
    };
  } catch {
    return { title: t('Creator unavailable'), robots: { index: false } };
  }
}
export default async function CreatorPage({ params }: Props) {
  const t = await getTranslator();

  const parsed = creatorSlugParams.safeParse(await params);
  if (!parsed.success) notFound();
  let creator;
  try {
    creator = await loadCreator(parsed.data.slug);
  } catch (error) {
    if (error instanceof PublicWallApiError && error.status === 404) notFound();
    return (
      <main className="creatorPage">
        <h1>{t('Creator temporarily unavailable')}</h1>
        <p role="alert">{t('Check your connection and try again.')}</p>
        <a className="actionLink" href={`/creators/${parsed.data.slug}`}>
          {t('Retry loading creator')}
        </a>
      </main>
    );
  }
  const { wall } = creator;
  return (
    <main className="creatorPage">
      <p className="eyebrow">{t('Creator')}</p>
      <h1>{creator.displayName}</h1>
      <section className="creatorWall" aria-labelledby="creator-wall-title">
        <h2 id="creator-wall-title">{t('Autograph Wall')}</h2>
        {wall ? (
          <>
            <p>{t(wall.status)}</p>
            {wall.startAt && (
              <p>
                {t('Starts:')}{' '}
                <time dateTime={wall.startAt}>
                  {new Date(wall.startAt)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 16)}{' '}
                  {t('UTC')}
                </time>
              </p>
            )}
            {wall.endAt && (
              <p>
                {t('Ends:')}{' '}
                <time dateTime={wall.endAt}>
                  {new Date(wall.endAt)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 16)}{' '}
                  {t('UTC')}
                </time>
              </p>
            )}
            <a className="primaryLink" href={`/walls/${wall.id}`}>
              {t('Open Wall')}
            </a>
          </>
        ) : (
          <p>{t('This author has no public Wall yet.')}</p>
        )}
      </section>
      <p>
        <a href="/autograph/create">{t('Prepare your digital autograph')}</a>
      </p>
    </main>
  );
}
