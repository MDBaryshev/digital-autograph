import qrcode from 'qrcode-generator';

export function wallInviteQr(url: string) {
  if (url.length > 512 || !/^https?:\/\/[\x20-\x7e]+$/.test(url))
    throw Error('Invalid invite URL');
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const size = count + 8;
  const cells: string[] = [];
  for (let y = 0; y < count; y++)
    for (let x = 0; x < count; x++)
      if (qr.isDark(y, x)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  const path = cells.join('');
  return {
    size,
    path,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="320" height="320"><rect width="${size}" height="${size}" fill="white"/><path fill="black" d="${path}"/></svg>`,
  };
}
