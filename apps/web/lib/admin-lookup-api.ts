import {
  adminLookupResponse,
  type AdminLookupResponse,
} from '@digital-autograph/contracts';

export class AdminLookupApiError extends Error {
  constructor(readonly status: number) {
    super('ADMIN_LOOKUP_UNAVAILABLE');
  }
}

export async function readAdminLookup(
  origin: string,
  id: string | undefined,
  owner: AbortSignal,
): Promise<AdminLookupResponse> {
  const controller = new AbortController();
  const { signal } = controller;
  const cancel = () => controller.abort();
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(signal.reason);
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  owner.addEventListener('abort', cancel, { once: true });
  const deadline = window.setTimeout(cancel, 10_000);
  if (owner.aborted) cancel();
  try {
    if (signal.aborted) return await aborted;
    return await Promise.race([
      (async () => {
        const query = id === undefined ? '' : '?' + new URLSearchParams({ id });
        const response = await fetch(`${origin}/admin/lookup${query}`, {
          credentials: 'include',
          cache: 'no-store',
          signal,
        });
        signal.throwIfAborted();
        if (response.status === 401 || response.status === 403)
          throw new AdminLookupApiError(response.status);
        const body: unknown = await response.json().catch(() => null);
        signal.throwIfAborted();
        if (!response.ok) throw new AdminLookupApiError(response.status);
        const result = adminLookupResponse.parse(body);
        if (result.items.some((item) => item.id !== id))
          throw new AdminLookupApiError(502);
        return result;
      })(),
      aborted,
    ]);
  } finally {
    window.clearTimeout(deadline);
    owner.removeEventListener('abort', cancel);
    signal.removeEventListener('abort', rejectAbort);
  }
}
