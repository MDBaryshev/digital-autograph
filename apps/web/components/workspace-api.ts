import type { AutographStatus, WallStatus } from '@digital-autograph/domain';
import { wallStatuses } from '@digital-autograph/domain';

type WorkspaceWall = {
  id: string;
  status: WallStatus;
  slotCount: number;
  createdAt: string;
};

export type Workspace = {
  profile: {
    id: string;
    slug: string;
    displayName: string;
    avatarDataUrl?: string | null;
  } | null;
  autographs: {
    id: string;
    source: string;
    status: AutographStatus;
    createdAt: string;
  }[];
  wall: WorkspaceWall | null;
  canModerate: boolean;
  canManageWallDesigns?: boolean;
  canEditProfile: boolean;
};

export async function getWorkspace(origin: string, signal: AbortSignal) {
  const response = await workspaceRequest<
    Omit<Workspace, 'wall'> & { walls: WorkspaceWall[] }
  >(origin, '/me/workspace', signal);
  if (!Array.isArray(response?.walls) || response.walls.length > 1)
    throw Error('REQUEST_FAILED');
  const { walls, ...workspace } = response;
  const wall = walls[0];
  if (
    walls.length &&
    (!wall ||
      typeof wall.id !== 'string' ||
      !wallStatuses.includes(wall.status))
  )
    throw Error('REQUEST_FAILED');
  return { ...workspace, wall: wall ?? null };
}
export async function workspaceRequest<T>(
  origin: string,
  path: string,
  signal: AbortSignal,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const response = await fetch(origin + path, {
    credentials: 'include',
    cache: 'no-store',
    signal,
    method: body === undefined ? 'GET' : method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(
      response.status === 401
        ? 'SIGN_IN'
        : (result?.error?.code ?? 'REQUEST_FAILED'),
    );
  return result as T;
}
