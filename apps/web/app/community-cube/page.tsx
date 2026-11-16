import type { Metadata } from 'next';
import { SupcubeDesignLab } from '../../components/supcube-design-lab';

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
    <SupcubeDesignLab
      standalone
      initialCube={(await searchParams).create === '1' ? 'create' : 'view'}
    />
  );
}
