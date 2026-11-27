export async function appearanceImageFile(
  file: File,
  kind: 'avatar' | 'cover' | 'wall-cover',
) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error();
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 20 * 1024 * 1024) throw Error();
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'avatar' ? 256 : 1200;
    canvas.height = kind === 'avatar' ? 256 : 400;
    if (kind === 'wall-cover') {
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error();
    const scale = Math.max(
      canvas.width / image.width,
      canvas.height / image.height,
    );
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      (canvas.width - image.width * scale) / 2,
      (canvas.height - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    const result = canvas.toDataURL('image/jpeg', 0.8);
    if (result.length > 350000) throw Error();
    return result;
  } finally {
    image.close();
  }
}
