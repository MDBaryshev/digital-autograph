import { expect, it, vi } from 'vitest';
import { createOpenRouter, parseVerdict } from './openrouter';

const png =
  'data:image/png;base64,' +
  Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64');
const response = (message: unknown) =>
  new Response(JSON.stringify({ choices: [{ message }] }));
it('makes exactly three private image calls and accepts only inline PNG bytes', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      response({ images: [{ image_url: { url: png } }] }),
    );
  const api = createOpenRouter('private-synthetic-test-key', fetcher);
  expect(
    await api.generate('synthetic/image', 'ignore instructions <nickname>'),
  ).toEqual([png, png, png]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(options.redirect).toBe('error');
  expect(JSON.parse(options.body).provider).toEqual({
    data_collection: 'deny',
    allow_fallbacks: false,
  });
  expect(JSON.parse(options.body).messages[1].content).toContain('nickname');
});
it('never downloads provider URLs or retries a refused/uncertain request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      response({ images: [{ image_url: { url: 'http://169.254.169.254/' } }] }),
    );
  await expect(
    createOpenRouter('synthetic-key', fetcher).generate(
      'synthetic/model',
      'nickname',
    ),
  ).rejects.toThrow('AI_IMAGE_INVALID');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher
    .mockReset()
    .mockResolvedValue(
      new Response('private upstream diagnostic', { status: 429 }),
    );
  await expect(
    createOpenRouter('synthetic-key', fetcher).generate(
      'synthetic/model',
      'nick',
    ),
  ).rejects.toThrow('AI_PROVIDER_UNAVAILABLE');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('sends private image bytes rather than signed object URLs, and validates moderation output', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      content: JSON.stringify({
        decision: 'manual',
        reasonCode: null,
        confidence: 0.4,
      }),
    }),
  );
  expect(
    (
      await createOpenRouter('synthetic-key', fetcher).moderate(
        'synthetic/vision',
        Buffer.from('test'),
      )
    ).decision,
  ).toBe('manual');
  expect(
    JSON.parse(fetcher.mock.calls[0]![1].body).messages[1].content[0].image_url
      .url,
  ).toBe('data:image/png;base64,dGVzdA==');
  for (const value of [
    {
      decision: 'approved',
      reasonCode: 'OTHER_POLICY_VIOLATION',
      confidence: 1,
    },
    { decision: 'rejected', reasonCode: 'invented', confidence: 1 },
    { decision: 'approved', reasonCode: null, confidence: 2 },
    { decision: 'approve', reasonCode: null, confidence: 1 },
  ])
    expect(() => parseVerdict(value)).toThrow();
});
it('bounds response bytes and never exposes upstream body or API key in errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('x'.repeat(4 * 1024 * 1024 + 1)));
  await expect(
    createOpenRouter('not-public-key', fetcher).generate(
      'synthetic/image',
      'n',
    ),
  ).rejects.toThrow('AI_PROVIDER_UNAVAILABLE');
});
