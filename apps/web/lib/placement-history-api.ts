import { wallIdParams } from '@digital-autograph/contracts';

export type PlacementHistoryItem = {
  wallId: string;
  wallSlug: string;
  wallDisplayName: string;
  wallIsPublic: boolean;
  slotPosition: number;
  source: 'free_claim' | 'takeover' | 'admin';
  startedAt: string;
  endedAt: string | null;
  endReason: 'displaced' | 'wall_ended' | 'administrative' | 'other' | null;
};

export type PublicWallPlacementHistory = {
  wallId: string;
  placements: Array<
    Pick<
      PlacementHistoryItem,
      'slotPosition' | 'source' | 'startedAt' | 'endedAt' | 'endReason'
    >
  >;
};

export class PlacementHistoryApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function requestJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const body: unknown = await response.json().catch(() => null);
  const code =
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object' &&
    'code' in body.error &&
    typeof body.error.code === 'string'
      ? body.error.code
      : 'REQUEST_FAILED';
  throw new PlacementHistoryApiError(response.status, code);
}

async function historyRequest<T>(
  origin: string,
  path: string,
  credentials: 'include' | 'omit',
  signal: AbortSignal | undefined,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error('HISTORY_REQUEST_ABORTED'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 10_000);
  if (signal?.aborted) cancel();
  try {
    if (controller.signal.aborted) return await aborted;
    return await Promise.race([
      (async () => {
        const response = await fetch(`${origin}${path}`, {
          cache: 'no-store',
          credentials,
          signal: controller.signal,
        });
        return read(response);
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
    // Session checks use headers only; release any unread response body too.
    controller.abort();
  }
}

type PublicPlacement = PublicWallPlacementHistory['placements'][number];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_HISTORY');
  return value as Record<string, unknown>;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function placement(value: unknown): PublicPlacement {
  const item = record(value);
  if (
    !Number.isSafeInteger(item.slotPosition) ||
    (item.slotPosition as number) < 0 ||
    !['free_claim', 'takeover', 'admin'].includes(item.source as string) ||
    !validDate(item.startedAt) ||
    !(item.endedAt === null || validDate(item.endedAt)) ||
    ![null, 'displaced', 'wall_ended', 'administrative', 'other'].includes(
      item.endReason as null | string,
    )
  )
    throw Error('INVALID_HISTORY');
  return {
    slotPosition: item.slotPosition as number,
    source: item.source as PublicPlacement['source'],
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    endReason: item.endReason as PublicPlacement['endReason'],
  };
}

function historyItems(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100)
    throw Error('INVALID_HISTORY');
  return value;
}

export function placementHistoryApi(origin: string) {
  return {
    async wall(
      wallId: string,
      signal?: AbortSignal,
    ): Promise<PublicWallPlacementHistory> {
      return historyRequest(
        origin,
        `/walls/${encodeURIComponent(wallId)}/placements`,
        'omit',
        signal,
        async (response) => {
          const body = record(await requestJson<unknown>(response));
          if (body.wallId !== wallId) throw Error('INVALID_HISTORY');
          return {
            wallId,
            placements: historyItems(body.placements).map(placement),
          };
        },
      );
    },
    async mine(signal?: AbortSignal): Promise<PlacementHistoryItem[]> {
      return historyRequest(
        origin,
        '/me/placements',
        'include',
        signal,
        async (response) => {
          const body = record(await requestJson<unknown>(response));
          return historyItems(body.items).map((value) => {
            const item = record(value);
            const publicItem = placement(item);
            if (
              !wallIdParams.safeParse({ id: item.wallId }).success ||
              typeof item.wallSlug !== 'string' ||
              typeof item.wallDisplayName !== 'string' ||
              typeof item.wallIsPublic !== 'boolean'
            )
              throw Error('INVALID_HISTORY');
            return {
              ...publicItem,
              wallId: item.wallId as string,
              wallSlug: item.wallSlug,
              wallDisplayName: item.wallDisplayName,
              wallIsPublic: item.wallIsPublic,
            };
          });
        },
      );
    },
    async session(
      signal?: AbortSignal,
    ): Promise<'authenticated' | 'anonymous'> {
      return historyRequest(
        origin,
        '/auth/me',
        'include',
        signal,
        async (response) => {
          if (response.ok) return 'authenticated' as const;
          if (response.status === 401) return 'anonymous' as const;
          throw new PlacementHistoryApiError(
            response.status,
            'AUTH_UNAVAILABLE',
          );
        },
      );
    },
  };
}

export function placementSourceLabel(source: PlacementHistoryItem['source']) {
  switch (source) {
    case 'free_claim':
      return 'Free Claim';
    case 'takeover':
      return 'Paid takeover';
    case 'admin':
      return 'Administrative placement';
  }
}

export function placementEndReasonLabel(
  reason: PlacementHistoryItem['endReason'],
) {
  switch (reason) {
    case 'displaced':
      return 'Replaced by a later placement';
    case 'wall_ended':
      return 'Wall ended';
    case 'administrative':
      return 'Ended by administration';
    case 'other':
      return 'Placement ended';
    case null:
      return null;
  }
}
