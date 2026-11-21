import {
  ownerSharesPageSchema,
  notificationIdParams,
} from '@digital-autograph/contracts';

export type OwnerSharePage = ReturnType<typeof ownerSharesPageSchema.parse>;
export type OwnerShare = OwnerSharePage['items'][number];
export class OwnerSharesApiError extends Error {
  constructor(readonly status: number) {
    super('OWNER_SHARES_REQUEST_FAILED');
  }
}

async function request(
  origin: string,
  path: string,
  method: 'GET' | 'DELETE',
  signal: AbortSignal,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new Error('OWNER_SHARES_ABORTED')),
      { once: true },
    );
  });
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 10_000);
  if (signal.aborted) cancel();
  try {
    if (controller.signal.aborted) return await aborted;
    return await Promise.race([
      (async () => {
        const response = await fetch(`${origin}${path}`, {
          method,
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new OwnerSharesApiError(response.status);
        return method === 'DELETE'
          ? undefined
          : ownerSharesPageSchema.parse(await response.json());
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

export const ownerSharesApi = (origin: string) => ({
  async list(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<OwnerSharePage> {
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) {
      notificationIdParams.parse({ id: cursor });
      query.set('cursor', cursor);
    }
    return (await request(origin, `/me/shares?${query}`, 'GET', signal))!;
  },
  async revoke(id: string, signal: AbortSignal): Promise<void> {
    notificationIdParams.parse({ id });
    await request(
      origin,
      `/me/shares/${encodeURIComponent(id)}`,
      'DELETE',
      signal,
    );
  },
});
