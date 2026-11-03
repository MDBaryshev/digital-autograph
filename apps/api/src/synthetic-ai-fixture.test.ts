import { expect, it, vi } from 'vitest';
import {
  syntheticAiTransport,
  installSyntheticAi,
} from '../../../e2e/synthetic-ai';
it('never forwards provider calls and emits exactly the three fixture responses', async () => {
  const fallback = vi.fn<typeof fetch>();
  const images = [Buffer.from('one'), Buffer.from('two'), Buffer.from('three')];
  const transport = syntheticAiTransport(fallback, images);
  for (const image of images) {
    const response = await transport.fetcher(
      'https://openrouter.ai/api/v1/images',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'synthetic/e2e-image', n: 1 }),
      },
    );
    expect((await response.json()).data[0].b64_json).toBe(
      image.toString('base64'),
    );
  }
  expect(transport.calls()).toBe(3);
  for (const [url, body] of [
    ['https://openrouter.ai/api/v1/chat/completions', {}],
    ['https://openrouter.ai/api/v1/images', { model: 'real/paid-model', n: 1 }],
  ])
    await expect(
      transport.fetcher(String(url), {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    ).rejects.toThrow();
  expect(fallback).not.toHaveBeenCalled();
});
it('refuses installation outside the dedicated E2E environment before changing fetch or flags', async () => {
  const before = globalThis.fetch;
  vi.stubEnv('APP_ENV', 'production');
  try {
    await expect(installSyntheticAi()).rejects.toThrow();
    expect(globalThis.fetch).toBe(before);
  } finally {
    vi.unstubAllEnvs();
  }
});
