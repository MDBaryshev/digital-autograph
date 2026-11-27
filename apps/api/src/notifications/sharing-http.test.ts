import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  PublicShare,
  ShareRepository,
} from '@digital-autograph/notifications';
import { registerSharingRoutes } from './sharing-http';

const render = vi.hoisted(() => vi.fn());
vi.mock('./share-card', () => ({ renderShareCard: render }));
afterEach(() => vi.resetAllMocks());
const share: PublicShare = {
  id: '11111111-1111-4111-8111-111111111111',
  wallId: '22222222-2222-4222-8222-222222222222',
  slotId: null,
  slotNumber: null,
  creator: 'Synthetic creator',
  publicAlias: null,
  event: 'final_wall',
};

it.each(['revoked', 'changed'])(
  'withholds bytes when the share is %s during asynchronous PNG rendering',
  async (change) => {
    const app = Fastify();
    let current: PublicShare | null = share;
    let finish!: (value: Buffer) => void;
    let started!: () => void;
    const rendering = new Promise<void>((resolve) => {
      started = resolve;
    });
    render.mockImplementation(() => {
      started();
      return new Promise<Buffer>((resolve) => {
        finish = resolve;
      });
    });
    const repository: ShareRepository = {
      public: vi.fn(async () => current),
      list: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      interact: vi.fn(),
    };
    registerSharingRoutes(app, repository);
    try {
      const response = app.inject({ url: `/public/shares/${share.id}/card` });
      // inject is lazy until consumed; start it before waiting for the renderer.
      const pending = response.then((result) => result);
      await rendering;
      current =
        change === 'revoked' ? null : { ...share, creator: 'Changed creator' };
      finish(Buffer.from('synthetic-png-bytes'));
      const result = await pending;
      expect(result.statusCode).toBe(404);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.json()).toEqual({ error: { code: 'NOT_FOUND' } });
      expect(repository.public).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  },
);

it('returns unchanged public bytes after a successful second check', async () => {
  const app = Fastify();
  const repository: ShareRepository = {
    public: vi.fn(async () => ({ ...share })),
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    interact: vi.fn(),
  };
  render.mockResolvedValue(Buffer.from('synthetic-png-bytes'));
  registerSharingRoutes(app, repository);
  try {
    const result = await app.inject({ url: `/public/shares/${share.id}/card` });
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.rawPayload.toString()).toBe('synthetic-png-bytes');
    expect(repository.public).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
  }
});
