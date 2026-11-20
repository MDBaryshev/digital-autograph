import type { Metadata } from 'next';
import { loadWebConfig } from '@digital-autograph/config';
import { CommunityCubeLive } from '../../../components/community-cube-live';
import { getTranslator } from '../../../lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t('Community cube'),
    robots: { index: false, follow: false },
  };
}

export default function CommunityCubeLivePage() {
  return <CommunityCubeLive apiOrigin={loadWebConfig().API_PUBLIC_ORIGIN} />;
}
