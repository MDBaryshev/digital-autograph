import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import sharp from 'sharp';
import type { Database } from '@digital-autograph/db';
import type { PrivateOriginalStorage } from '@digital-autograph/autographs';
import { registerAiAutographs } from './ai-autographs';

// Exercise HTTP -> real provider adapter -> normalized PNG -> owner result.
// PostgreSQL admission/quotas have their own cross-pool integration tests.
const repo = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  read: vi.fn(),
  expireImages: vi.fn(),
}));
vi.mock('@digital-autograph/db', async (original) => ({
  ...(await original<object>()),
  createPgAiAutographRepository: () => repo,
}));
const actor = 'f1111111-1111-4111-8111-111111111111';
const requestId = 'f2222222-2222-4222-8222-222222222222';
const storage = { getPrivateObject: vi.fn(), putPrivateObject: vi.fn() };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function appForGeneration() {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.authContext = {
      kind: 'authenticated',
      session: { user: { id: actor } } as never,
    };
  });
  registerAiAutographs(
    app,
    {} as Database['pool'],
    storage as unknown as PrivateOriginalStorage,
    {
      key: 'private-synthetic-key',
      generationModel: 'openai/gpt-image-2',
      moderationModel: null,
      moderatorId: null,
    },
  );
  return app;
}

it('serves three normalized choices and replays the completed request without another image charge', async () => {
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
  const fetcher = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            { media_type: 'image/jpeg', b64_json: jpeg.toString('base64') },
          ],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  repo.claim.mockResolvedValue({ fresh: true });
  repo.finish.mockResolvedValue(undefined);
  const app = await appForGeneration();
  try {
    const start = await app.inject({
      method: 'POST',
      url: '/ai/autographs/suggestions',
      payload: { requestId, nickname: 'Лисёнок' },
    });
    expect(start.statusCode).toBe(202);
    expect(start.headers['cache-control']).toBe('no-store');
    await vi.waitFor(() => expect(repo.finish).toHaveBeenCalledOnce());
    const [owner, id, result, failed] = repo.finish.mock.calls[0]!;
    expect([owner, id, failed]).toEqual([actor, requestId, undefined]);
    expect(result.images).toHaveLength(3);
    for (const image of result.images) {
      const bytes = Buffer.from(image.split(',')[1]!, 'base64');
      expect((await sharp(bytes).metadata()).format).toBe('png');
    }
    repo.read.mockResolvedValue({
      state: 'completed',
      result,
      created_at: new Date(),
    });
    const read = await app.inject('/ai/autographs/suggestions/' + requestId);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ state: 'completed', ...result });
    expect(repo.read).toHaveBeenCalledWith(actor, requestId);
    repo.claim.mockResolvedValue({ fresh: false, result });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/ai/autographs/suggestions',
          payload: { requestId, nickname: 'Лисёнок' },
        })
      ).statusCode,
    ).toBe(202);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(storage.getPrivateObject).not.toHaveBeenCalled();
    expect(storage.putPrivateObject).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it('records failure instead of partial choices and does not retry an unavailable request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('private upstream detail', { status: 502 }),
    );
  vi.stubGlobal('fetch', fetcher);
  repo.claim.mockResolvedValue({ fresh: true });
  repo.finish.mockResolvedValue(undefined);
  const app = await appForGeneration();
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/ai/autographs/suggestions',
          payload: { requestId, nickname: 'neo_42' },
        })
      ).statusCode,
    ).toBe(202);
    await vi.waitFor(() =>
      expect(repo.finish).toHaveBeenCalledWith(
        actor,
        requestId,
        { error: 'AI_GENERATION_FAILED' },
        true,
      ),
    );
    const { AiAdmissionError } = await import('@digital-autograph/db');
    repo.claim.mockRejectedValue(
      new AiAdmissionError('AI_REQUEST_UNAVAILABLE'),
    );
    const retry = await app.inject({
      method: 'POST',
      url: '/ai/autographs/suggestions',
      payload: { requestId, nickname: 'neo_42' },
    });
    expect(retry.statusCode).toBe(409);
    expect(retry.body).not.toContain('private upstream detail');
    expect(fetcher).toHaveBeenCalledOnce();
  } finally {
    await app.close();
  }
});
