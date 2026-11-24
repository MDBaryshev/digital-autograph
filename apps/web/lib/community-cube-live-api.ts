import { autographIdParams } from '@digital-autograph/contracts';
import {
  communityCubeCapacity,
  communityCubeMaxCell,
  communityCubeMaxGeneration,
} from '@digital-autograph/domain';

export const communityCubePath = '/community-cube/live';

export type PublishedCube = {
  generation: number;
  capacity: number;
  occupiedCells: number[];
};

export type CubePlacement = {
  id: string;
  cell: number;
  autographId: string;
};

export type CubePlacementRequest = {
  generation: number;
  cell: number;
  autographId: string;
  requestId: string;
};

export class CommunityCubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
}

function isCell(cell: unknown, capacity: number): cell is number {
  return (
    typeof cell === 'number' &&
    Number.isSafeInteger(cell) &&
    cell >= 1 &&
    cell <= capacity
  );
}

function parseCube(value: unknown): PublishedCube {
  const { generation, capacity, occupiedCells } = asObject(value) ?? {};
  if (
    typeof generation !== 'number' ||
    !Number.isInteger(generation) ||
    generation < 1 ||
    generation > communityCubeMaxGeneration ||
    capacity !== communityCubeCapacity(generation) ||
    !Array.isArray(occupiedCells) ||
    occupiedCells.length > capacity ||
    !occupiedCells.every((cell) => isCell(cell, capacity)) ||
    new Set(occupiedCells).size !== occupiedCells.length
  )
    throw new CommunityCubeApiError(502, 'INVALID_CUBE_RESPONSE');
  return { generation, capacity, occupiedCells };
}

function parsePlacement(value: unknown): CubePlacement | null {
  const placement = asObject(value)?.placement;
  if (placement === null) return null;
  const { id, cell, autographId } = asObject(placement) ?? {};
  const placementId = autographIdParams.safeParse({ id });
  const autograph = autographIdParams.safeParse({ id: autographId });
  if (
    !placementId.success ||
    !autograph.success ||
    !isCell(cell, communityCubeMaxCell)
  )
    throw new CommunityCubeApiError(502, 'INVALID_PLACEMENT_RESPONSE');
  return { id: placementId.data.id, cell, autographId: autograph.data.id };
}

export async function withCubeDeadline<T>(
  signal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(cancel, 10_000);
  try {
    return await work(controller.signal);
  } finally {
    signal.removeEventListener('abort', cancel);
    window.clearTimeout(timer);
  }
}

export function communityCubeLiveApi(origin: string) {
  async function request(
    path: string,
    signal: AbortSignal,
    options: RequestInit = {},
  ): Promise<unknown> {
    return withCubeDeadline(signal, async (requestSignal) => {
      const response = await fetch(origin + path, {
        cache: 'no-store',
        credentials: 'include',
        ...options,
        signal: requestSignal,
      });
      if (response.status === 204) return null;
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = asObject(asObject(body)?.error)?.code;
        throw new CommunityCubeApiError(
          response.status,
          typeof code === 'string' ? code : 'REQUEST_FAILED',
        );
      }
      return body;
    });
  }

  return {
    async cube(signal: AbortSignal) {
      return parseCube(
        await request('/community-cube', signal, { credentials: 'omit' }),
      );
    },
    async placement(signal: AbortSignal) {
      return parsePlacement(await request('/me/community-cube', signal));
    },
    async publish(body: CubePlacementRequest, signal: AbortSignal) {
      const placement = parsePlacement(
        await request('/me/community-cube', signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      if (!placement)
        throw new CommunityCubeApiError(502, 'INVALID_PLACEMENT_RESPONSE');
      return placement;
    },
    async withdraw(id: string, signal: AbortSignal) {
      await request(`/me/community-cube/${encodeURIComponent(id)}`, signal, {
        method: 'DELETE',
      });
    },
    media(cell: number) {
      return `${origin}/community-cube/cells/${cell}/media`;
    },
  };
}
