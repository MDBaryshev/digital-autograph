import type { PublicWall } from './public-wall-api';
import { PublicWallApiError } from './public-wall-api';

type CreatorWall = Pick<PublicWall, 'id' | 'status' | 'startAt' | 'endAt'>;

export type PublicCreator = {
  id: string;
  slug: string;
  displayName: string;
  wall: CreatorWall | null;
};

export async function getPublicCreator(
  origin: string,
  slug: string,
): Promise<PublicCreator> {
  const response = await fetch(
    `${origin}/creators/${encodeURIComponent(slug)}`,
    {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new PublicWallApiError(response.status);
  const { walls, ...creator } = (await response.json()) as Omit<
    PublicCreator,
    'wall'
  > & { walls: CreatorWall[] };
  return { ...creator, wall: walls[0] ?? null };
}
