export async function withRequestDeadline<T>(
  controller: AbortController,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { signal } = controller;
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = window.setTimeout(
    () =>
      controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    10_000,
  );
  try {
    return await Promise.race([aborted, work(signal)]);
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
