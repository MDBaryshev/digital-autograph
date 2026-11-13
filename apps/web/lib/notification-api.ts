export async function notificationRequest<T>(
  origin: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new Error('Notification request canceled or timed out.')),
      { once: true },
    );
  });
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 10_000);
  if (signal?.aborted) cancel();
  try {
    if (controller.signal.aborted) return await aborted;
    // Bound both fetch and body reading, even if a transport ignores abort.
    return await Promise.race([
      (async () => {
        const response = await fetch(`${origin}${path}`, {
          method,
          credentials: 'include',
          cache: 'no-store',
          headers:
            body === undefined
              ? undefined
              : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) throw new NotificationApiError(response.status);
        return (
          response.status === 204 ? undefined : await response.json()
        ) as T;
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export class NotificationApiError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? 'Sign in to manage notifications.'
        : status === 403
          ? 'Notification access is no longer available to this account.'
          : `Request failed (${status}). Please retry.`,
    );
  }
}
