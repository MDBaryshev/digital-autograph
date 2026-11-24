import { describe, expect, it, vi } from 'vitest';
import { createTelegramTestWallWidgetClient } from './telegram-wall-widget-client';

const token = '1:isolated-test';
const input = {
  chatId: 42,
  locale: 'ru' as const,
  revision: 0,
  webOrigin: 'https://example.com',
  wall: {
    id: 'f18ba27b-4ac1-4c14-8ea3-ce3f5d78b22c',
    status: 'live' as const,
    slotCount: 10,
    creator: { displayName: 'Test wall' },
    slots: Array.from({ length: 10 }, (_, position) => ({
      position,
      occupied: position === 2,
    })),
  },
};

describe('Telegram wall widget test transport', () => {
  it('sends a shared widget to the test server and extracts its identifier', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        result: {
          message_id: 12,
          chat: { id: 42, type: 'private' },
          widget: { id: 'sample-id' },
        },
      }),
    );
    const client = createTelegramTestWallWidgetClient(token, request);
    expect(await client.send(input)).toEqual({
      state: 'sent',
      messageId: 12,
      widgetId: 'sample-id',
    });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${token}/test/sendWidget`);
    expect(init?.redirect).toBe('error');
    const payload = JSON.parse(String(init?.body));
    expect(JSON.parse(payload.public_data)).toEqual({
      r: 0,
      wall: {
        title: 'Test wall',
        href: `https://example.com/walls/${input.wall.id}`,
        slots: '0010000000',
      },
    });
  });

  it('handles a confirmed withdrawal and a rate limit without replaying a send', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ok: true, result: true }))
      .mockResolvedValueOnce(
        Response.json(
          {
            ok: false,
            error_code: 429,
            parameters: { retry_after: 3 },
          },
          { status: 429 },
        ),
      )
      .mockRejectedValueOnce(new Error('connection interrupted'));
    const client = createTelegramTestWallWidgetClient(token, request);
    expect(
      await client.update({
        wall: null,
        revision: 1,
        widgetId: 'sample-id',
        webOrigin: input.webOrigin,
      }),
    ).toEqual({ state: 'updated' });
    expect(request.mock.calls[0]?.[0]).toBe(
      `https://api.telegram.org/bot${token}/test/editSharedWidgetData`,
    );
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      widget_id: 'sample-id',
      public_data: '{"r":1,"wall":null}',
      cache_time: 30,
    });
    expect(await client.send(input)).toEqual({
      state: 'retry',
      retryAfterSeconds: 3,
    });
    expect(await client.send(input)).toEqual({ state: 'uncertain' });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
