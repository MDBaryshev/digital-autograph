import type { Metadata } from 'next';
import { loadWebConfig } from '@digital-autograph/config';
import { AdminLookup } from '../../components/admin-lookup';
import { getTranslator, localizeMetadata } from '../../lib/i18n-server';
import styles from '../../components/workspace.module.css';

export const dynamic = 'force-dynamic';
const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};
export async function generateMetadata() {
  return localizeMetadata(metadata);
}
export default async function AdminPage() {
  const t = await getTranslator();
  return (
    <main className={styles.page}>
      <h1>{t('Administration')}</h1>
      <AdminLookup apiOrigin={loadWebConfig().API_PUBLIC_ORIGIN} />
    </main>
  );
}
