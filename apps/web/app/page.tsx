import { SupcubeDesignLab } from '../components/supcube-design-lab';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <SupcubeDesignLab
      standalone
      publicCubeEnabled={
        process.env.COMMUNITY_CUBE_PUBLICATION_ENABLED === 'true'
      }
    />
  );
}
