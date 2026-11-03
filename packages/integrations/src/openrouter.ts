import {
  autographModerationRequest,
  parseModerationResponse,
  type AiVerdict,
} from './autograph-moderation';
export { parseVerdict, type AiVerdict } from './autograph-moderation';
import sharp from 'sharp';
import {
  autographGenerationStyles,
  autographImageRequest,
} from './autograph-generation-prompts';

const maxImageInputBytes = 4 * 1024 * 1024;
const maxImageOutputBytes = 2 * 1024 * 1024;

async function normalizeImage(data: Record<string, unknown>): Promise<string> {
  try {
    if (!Array.isArray(data.data) || data.data.length !== 1) throw Error();
    const image = data.data[0];
    if (
      !image ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(image.media_type) ||
      typeof image.b64_json !== 'string' ||
      image.b64_json.length > 4 * Math.ceil(maxImageInputBytes / 3) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.b64_json)
    )
      throw Error();
    const bytes = Buffer.from(image.b64_json, 'base64');
    if (
      bytes.length > maxImageInputBytes ||
      bytes.toString('base64') !== image.b64_json
    )
      throw Error();
    // Sniff before invoking any decoder: mislabeled SVG/HTML never reaches Sharp.
    const format =
      bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        ? 'png'
        : bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
          ? 'jpeg'
          : bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
              bytes.subarray(8, 12).toString('ascii') === 'WEBP'
            ? 'webp'
            : null;
    if (!format || image.media_type !== `image/${format}`) throw Error();
    const decoder = sharp(bytes, {
      limitInputPixels: 16 * 1024 * 1024,
      failOn: 'warning',
    });
    const metadata = await decoder.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1)
      throw Error();
    const png = await decoder
      .rotate()
      .resize({
        width: 1024,
        height: 1024,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    // Sharp strips source metadata by default. Only normalized bounded PNG leaves here.
    if (png.length > maxImageOutputBytes) throw Error();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    throw Error('AI_IMAGE_INVALID');
  }
}

export function createOpenRouter(key: string, fetcher = fetch) {
  async function request(
    endpoint: 'images' | 'chat/completions',
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetcher(
        `https://openrouter.ai/api/v1/${endpoint}`,
        {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok || !response.body) throw Error('AI_PROVIDER_FAILED');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > (endpoint === 'images' ? 8 : 4) * 1024 * 1024)
            throw Error('AI_RESPONSE_TOO_LARGE');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!json || typeof json !== 'object' || Array.isArray(json))
        throw Error('AI_RESPONSE_INVALID');
      return json;
    } catch {
      throw Error('AI_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async generate(model: string, nickname: string): Promise<string[]> {
      // Sequential, three independent variants; no automatic retries after an uncertain charge.
      const images: string[] = [];
      for (const style of autographGenerationStyles) {
        // Images API data-collection policy is configured on the provider account;
        // it does not accept Chat Completions' provider.data_collection field.
        const data = await request(
          'images',
          autographImageRequest(model, nickname, style),
        );
        images.push(await normalizeImage(data));
      }
      return images;
    },
    async moderate(model: string, bytes: Buffer): Promise<AiVerdict> {
      const data = await request(
        'chat/completions',
        autographModerationRequest(model, bytes),
      );
      return parseModerationResponse(data);
    },
  };
}
