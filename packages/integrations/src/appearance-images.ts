import sharp from 'sharp';
let activeDecoders = 0;

export async function normalizeAppearanceImage(
  dataUrl: string,
  kind: 'avatar' | 'cover' | 'wall-cover',
): Promise<string> {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2]!.length > 4 * Math.ceil(262144 / 3))
    throw Error('INVALID_APPEARANCE_IMAGE');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (
    !bytes.length ||
    bytes.length > 262144 ||
    bytes.toString('base64') !== match[2]
  )
    throw Error('INVALID_APPEARANCE_IMAGE');
  const signature =
    bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      ? 'png'
      : bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
        ? 'jpeg'
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'webp'
          : null;
  if (signature !== match[1]) throw Error('INVALID_APPEARANCE_IMAGE');
  if (activeDecoders >= 2) throw Error('INVALID_APPEARANCE_IMAGE');
  activeDecoders++;
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 4 * 1024 * 1024,
      failOn: 'warning',
    });
    const meta = await decoder.metadata();
    if (meta.format !== signature || (meta.pages ?? 1) !== 1) throw Error();
    const sizes = {
      avatar: { width: 256, height: 256, fit: 'cover' },
      cover: { width: 1200, height: 400, fit: 'cover' },
      'wall-cover': {
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      },
    } as const;
    const result = await decoder
      .rotate()
      .resize(sizes[kind])
      .flatten({ background: '#fff' })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (result.length > 262144) throw Error();
    return 'data:image/jpeg;base64,' + result.toString('base64');
  } catch {
    throw Error('INVALID_APPEARANCE_IMAGE');
  } finally {
    activeDecoders--;
  }
}

export async function importProviderAvatar(
  provider: string,
  input: string,
  fetcher = fetch,
): Promise<string | null> {
  try {
    if (input.length > 4096) return null;
    const url = new URL(input);
    const allowed: Record<string, RegExp> = {
      google: /^(?:[a-z0-9-]+\.)*googleusercontent\.com$/,
      telegram: /^(?:t\.me|(?:[a-z0-9-]+\.)*telegram\.org)$/,
      yandex: /^avatars\.yandex\.net$/,
      vk_id: /^(?:[a-z0-9-]+\.)*(?:userapi\.com|vkuserphoto\.ru|vk\.com)$/,
    };
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !allowed[provider]?.test(url.hostname)
    )
      return null;
    const response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type ?? '')) {
      await response.body.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 262144) throw Error();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return await normalizeAppearanceImage(
      `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`,
      'avatar',
    );
  } catch {
    return null;
  }
}
