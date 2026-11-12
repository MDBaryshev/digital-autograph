export class FeedRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function feedRequest<T>(
  origin: string,
  path: string,
  schema: { parse: (value: unknown) => T },
  signal: AbortSignal,
  method: 'GET' | 'PUT' | 'DELETE' = 'GET',
): Promise<T> {
  const response = await fetch(origin + path, {
    method,
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new FeedRequestError(
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
    );
  return schema.parse(body);
}
