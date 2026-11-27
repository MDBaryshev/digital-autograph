import type { Metadata } from 'next';
import { loadWebConfig } from '@digital-autograph/config';
import { EmailAuthForm } from '../../../../components/email-auth-form';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'supcube — Email',
  robots: { index: false, follow: false },
};
export default function EmailAuthPage() {
  const { API_PUBLIC_ORIGIN } = loadWebConfig();
  return (
    <main>
      <EmailAuthForm apiOrigin={API_PUBLIC_ORIGIN} confirm={true} />
    </main>
  );
}
