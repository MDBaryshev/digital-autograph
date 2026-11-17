import workspaceStyles from '../../../components/workspace.module.css';
import { loadWebConfig } from '@digital-autograph/config';
import { AccountWorkspace } from '../../../components/account-workspace';
import { wallIdParams } from '@digital-autograph/contracts';
import { getTranslator } from '../../../lib/i18n-server';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ wall?: string | string[] }>;
}) {
  const t = await getTranslator();
  const wall = wallIdParams.safeParse({ id: (await searchParams).wall });
  const wallId = wall.success ? wall.data.id : undefined;
  return (
    <main className={workspaceStyles.page}>
      {wallId && (
        <a className="actionLink" href={`/walls/${wallId}`}>
          {t('Back to the Wall')}
        </a>
      )}
      <h1>{t('My autographs')}</h1>
      <AccountWorkspace
        apiOrigin={loadWebConfig().API_PUBLIC_ORIGIN}
        section="autographs"
        wallId={wallId}
      />
    </main>
  );
}
