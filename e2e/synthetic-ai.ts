// Test-only HTTP transport. Never imported by an application entrypoint.
import sharp from 'sharp';
import { isolatedE2EEnvironment } from './environment';

export function syntheticAiTransport(fallback: typeof fetch, images: Buffer[]) {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'openrouter.ai') return fallback(input, options);
    // Never forward any OpenRouter request, even an unexpected model/endpoint.
    if (
      url.origin !== 'https://openrouter.ai' ||
      url.pathname !== '/api/v1/images' ||
      url.search ||
      options?.method !== 'POST'
    )
      throw Error('Unexpected synthetic AI request');
    const body = JSON.parse(String(options.body));
    if (
      body.model !== 'synthetic/e2e-image' ||
      body.n !== 1 ||
      images.length !== 3
    )
      throw Error('Unexpected synthetic AI payload');
    const image = images[calls++ % 3]!;
    return Response.json({
      data: [{ media_type: 'image/png', b64_json: image.toString('base64') }],
      usage: { cost: 0 },
    });
  };
  return { fetcher, calls: () => calls };
}
export async function installSyntheticAi() {
  isolatedE2EEnvironment();
  const images = await Promise.all(
    [0, 1, 2].map((n) =>
      sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="white"/><path d="M180 ${300 + n * 20} Q350 140 520 310 T980 260" stroke="black" fill="none" stroke-width="${8 + n * 2}"/></svg>`,
        ),
      )
        .png()
        .toBuffer(),
    ),
  );
  const transport = syntheticAiTransport(globalThis.fetch, images);
  globalThis.fetch = transport.fetcher;
  process.env.AI_AUTOGRAPH_GENERATION_ENABLED = 'true';
  process.env.AI_AUTOGRAPH_MODERATION_ENABLED = 'false';
  process.env.OPENROUTER_IMAGE_MODEL = 'synthetic/e2e-image';
  process.env.OPENROUTER_API_KEY = 'synthetic-e2e-no-live-provider-requests';
}
