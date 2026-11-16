import type { Metadata } from 'next';
import { CommunityCube } from '../../components/community-cube';

export const metadata: Metadata = {
  title: 'Общий куб · локальный концепт',
  robots: { index: false, follow: false },
};

export default function CommunityCubePage() {
  return <CommunityCube />;
}
