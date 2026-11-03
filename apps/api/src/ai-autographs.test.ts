import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { Database } from '@digital-autograph/db';
import type { PrivateOriginalStorage } from '@digital-autograph/autographs';
import { registerAiAutographs } from './ai-autographs';
const mocks = vi.hoisted(() => ({
  repo: {
    claim: vi.fn(),
    finish: vi.fn(),
    read: vi.fn(),
    candidates: vi.fn(),
    expireImages: vi.fn(),
  },
  moderation: { list: vi.fn(), previewTarget: vi.fn(), decide: vi.fn() },
  provider: { generate: vi.fn(), moderate: vi.fn() },
}));
vi.mock('@digital-autograph/db', async (original) => ({
  ...(await original<object>()),
  createPgAiAutographRepository: () => mocks.repo,
  createPgAutographModerationRepository: () => mocks.moderation,
}));
vi.mock('@digital-autograph/integrations', () => ({
  createOpenRouter: () => mocks.provider,
}));
const actor = 'f1111111-1111-4111-8111-111111111111';
const storage = {
  getPrivateObject: vi
    .fn()
    .mockResolvedValue(Buffer.from('private cleaned bytes')),
} as unknown as PrivateOriginalStorage;
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('records a confident verdict before using the existing decision path', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  mocks.repo.expireImages.mockResolvedValue(undefined);
  mocks.moderation.list.mockResolvedValue({ items: [] });
  mocks.repo.candidates.mockResolvedValue([
    { id: 'autograph', cleaned_asset_id: 'asset' },
  ]);
  mocks.repo.claim.mockResolvedValue({ fresh: true });
  mocks.repo.finish.mockResolvedValue(undefined);
  mocks.moderation.previewTarget.mockResolvedValue({ key: 'private-key' });
  mocks.provider.moderate.mockResolvedValue({
    decision: 'approved',
    reasonCode: null,
    confidence: 0.99,
  });
  const app = Fastify();
  registerAiAutographs(app, {} as Database['pool'], storage, {
    key: 'synthetic',
    generationModel: null,
    moderationModel: 'synthetic/vision',
    moderatorId: actor,
  });
  await app.ready();
  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.moderation.decide).toHaveBeenCalledWith(actor, 'autograph', {
      decision: 'approved',
    });
    expect(mocks.repo.finish.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.moderation.decide.mock.invocationCallOrder[0]!,
    );
    mocks.repo.claim.mockResolvedValue({ fresh: false });
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.provider.moderate).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
it('returns 202 before provider completion and binds result reads to the validated session', async () => {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.authContext = {
      kind: 'authenticated',
      session: { user: { id: actor } } as never,
    };
  });
  mocks.repo.claim.mockResolvedValue({ fresh: true });
  mocks.repo.finish.mockResolvedValue(undefined);
  let done!: (v: string[]) => void;
  mocks.provider.generate.mockReturnValue(
    new Promise<string[]>((r) => {
      done = r;
    }),
  );
  registerAiAutographs(app, {} as Database['pool'], storage, {
    key: 'synthetic',
    generationModel: 'synthetic/image',
    moderationModel: null,
    moderatorId: null,
  });
  try {
    const id = 'f2222222-2222-4222-8222-222222222222';
    const response = await app.inject({
      method: 'POST',
      url: '/ai/autographs/suggestions',
      payload: { requestId: id, nickname: 'my-nick' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mocks.repo.finish).not.toHaveBeenCalled();
    mocks.repo.read.mockResolvedValue(null);
    expect(
      (await app.inject('/ai/autographs/suggestions/' + id)).statusCode,
    ).toBe(404);
    expect(mocks.repo.read).toHaveBeenCalledWith(actor, id);
    done(['a', 'b', 'c']);
  } finally {
    await app.close();
  }
});
it.each([
  { decision: 'manual', reasonCode: null, confidence: 1 },
  { decision: 'approved', reasonCode: null, confidence: 0.8 },
])('never auto approves uncertain classifications: %j', async (verdict) => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  mocks.repo.expireImages.mockResolvedValue(undefined);
  mocks.moderation.list.mockResolvedValue({ items: [] });
  mocks.repo.candidates.mockResolvedValue([
    { id: 'autograph', cleaned_asset_id: 'asset' },
  ]);
  mocks.repo.claim.mockResolvedValue({ fresh: true });
  mocks.repo.finish.mockResolvedValue(undefined);
  mocks.moderation.previewTarget.mockResolvedValue({ key: 'private-key' });
  mocks.provider.moderate.mockResolvedValue(verdict);
  const app = Fastify();
  registerAiAutographs(app, {} as Database['pool'], storage, {
    key: 'synthetic',
    generationModel: null,
    moderationModel: 'synthetic/vision',
    moderatorId: actor,
  });
  await app.ready();
  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.repo.finish).toHaveBeenCalled();
    expect(mocks.moderation.decide).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it('does not dispatch duplicate moderation attempts or call a provider with revoked moderator access', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  mocks.repo.expireImages.mockResolvedValue(undefined);
  mocks.moderation.list.mockRejectedValue(Error('FORBIDDEN'));
  const app = Fastify();
  registerAiAutographs(app, {} as Database['pool'], storage, {
    key: 'synthetic',
    generationModel: null,
    moderationModel: 'synthetic/vision',
    moderatorId: actor,
  });
  await app.ready();
  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.provider.moderate).not.toHaveBeenCalled();
    expect(mocks.repo.claim).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
