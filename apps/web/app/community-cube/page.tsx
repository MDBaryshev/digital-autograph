import type { Metadata } from 'next';
import { CommunityCube } from '../../components/community-cube';

export const metadata: Metadata = {
  title: 'Общий куб · локальный концепт',
  robots: { index: false, follow: false },
};

export default async function CommunityCubePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  return (
    <CommunityCube initialCreating={(await searchParams).create === '1'} />
  );
}
