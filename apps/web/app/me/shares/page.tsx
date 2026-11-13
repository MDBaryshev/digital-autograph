import { loadWebConfig } from '@digital-autograph/config';
import { OwnerShareLinks } from '../../../components/owner-share-links';
import { localizeMetadata } from '../../../lib/i18n-server';

const pageMetadata = {
  title: 'My public links',
  robots: { index: false, follow: false },
};
export async function generateMetadata() {
  return localizeMetadata(pageMetadata);
}
export const dynamic = 'force-dynamic';
export default function Page() {
  return <OwnerShareLinks apiOrigin={loadWebConfig().API_PUBLIC_ORIGIN} />;
}
