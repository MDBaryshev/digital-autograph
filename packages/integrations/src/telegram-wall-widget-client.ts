import {
  buildTelegramWallWidgetSend,
  buildTelegramWallWidgetUpdate,
} from './telegram-wall-widget';

type SendInput = Parameters<typeof buildTelegramWallWidgetSend>[0];
type UpdateInput = Parameters<typeof buildTelegramWallWidgetUpdate>[0];
type Unconfirmed =
  | { state: 'rejected' }
  | { state: 'retry'; retryAfterSeconds: number }
  | { state: 'uncertain' };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readResult(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } finally {
    reader.releaseLock();
  }
}

/** This client only connects to Telegram's isolated Test Bot API. */
export function createTelegramTestWallWidgetClient(
  token: string,
  request: typeof fetch = fetch,
) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('A Telegram test bot token is required');
  }

  async function call(
    method: 'sendWidget' | 'editSharedWidgetData',
    payload: ReturnType<
      typeof buildTelegramWallWidgetSend | typeof buildTelegramWallWidgetUpdate
    >,
  ): Promise<{ state: 'confirmed'; result: unknown } | Unconfirmed> {
    try {
      const response = await request(
        `https://api.telegram.org/bot${token}/test/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(payload),
        },
      );
      const body = object(await readResult(response));
      if (response.ok && body?.ok === true) {
        return { state: 'confirmed', result: body.result };
      }
      if (body?.ok === false && body.error_code === response.status) {
        if (response.status === 429) {
          const delay = object(body.parameters)?.retry_after;
          return {
            state: 'retry',
            retryAfterSeconds:
              typeof delay === 'number' && Number.isFinite(delay)
                ? Math.min(86400, Math.max(1, Math.ceil(delay)))
                : 60,
          };
        }
        if ([400, 401, 403, 404].includes(response.status)) {
          return { state: 'rejected' };
        }
      }
    } catch {
      // A response can be lost after a message is sent. Keep provider details private.
    }
    return { state: 'uncertain' };
  }

  return {
    async send(
      input: SendInput,
    ): Promise<
      { state: 'sent'; messageId: number; widgetId: string } | Unconfirmed
    > {
      const response = await call(
        'sendWidget',
        buildTelegramWallWidgetSend(input),
      );
      if (response.state !== 'confirmed') return response;
      const message = object(response.result);
      const chat = object(message?.chat);
      const widgetId = object(message?.widget)?.id;
      const messageId = message?.message_id;
      if (
        chat?.type === 'private' &&
        chat?.id === input.chatId &&
        typeof widgetId === 'string' &&
        widgetId.trim() &&
        typeof messageId === 'number' &&
        Number.isSafeInteger(messageId) &&
        messageId > 0
      ) {
        return { state: 'sent', messageId, widgetId };
      }
      return { state: 'uncertain' };
    },
    async update(
      input: UpdateInput,
    ): Promise<{ state: 'updated' } | Unconfirmed> {
      const response = await call(
        'editSharedWidgetData',
        buildTelegramWallWidgetUpdate(input),
      );
      if (response.state !== 'confirmed') return response;
      return response.result === true
        ? { state: 'updated' }
        : { state: 'uncertain' };
    },
  };
}
