import type { Metadata } from 'next';
import { SupcubeDesignLab } from '../../components/supcube-design-lab';

export const metadata: Metadata = {
  title: 'Два направления дизайна',
  robots: { index: false, follow: false },
};

export default function DesignLabPage() {
  return <SupcubeDesignLab />;
}
