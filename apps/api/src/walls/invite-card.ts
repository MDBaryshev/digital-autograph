import sharp from 'sharp';
import type { PublicWall } from '@digital-autograph/walls';

const clean = (value: string) =>
  Array.from(value)
    .map((c) => {
      const n = c.codePointAt(0)!;
      return n < 32 || (n >= 0xd800 && n <= 0xdfff) || (n & 0xffff) >= 0xfffe
        ? ' '
        : c;
    })
    .join('');
const xml = (value: string) =>
  clean(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export async function renderWallInviteCard(
  wall: PublicWall,
  locale: 'ru' | 'en',
) {
  const text = Array.from(
    clean(wall.appearance?.title || wall.creator.displayName),
  );
  const first = text.slice(0, 24).join('');
  const second = text.slice(24, 47).join('') + (text.length > 47 ? '…' : '');
  const colours = ['#c28b1d', '#8b99aa', '#b87343'];
  const slots = Array.from({ length: 10 }, (_, i) => {
    const x = 64 + i * 108;
    const edge = colours[i] ?? '#171717';
    return `<g transform="translate(${x} 424)"><rect width="96" height="100" rx="14" fill="#fff" stroke="${edge}" stroke-width="3"/>${i < 3 ? `<path d="M24 28 36 36 48 18 60 36 72 28 66 54H30Z" fill="${edge}"/>` : ''}<text x="48" y="${i < 3 ? 82 : 62}" text-anchor="middle" font-size="24" fill="#171717">${i + 1}</text></g>`;
  }).join('');
  // Text-only SVG: no autograph, avatar, cover, external URL, private candidate or provider data.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><style>text{font-family:'DejaVu Sans',sans-serif}</style>
    <rect width="1200" height="630" fill="#f6f7fc"/><rect x="0" y="0" width="1200" height="14" fill="#3859ec"/>
    <text x="64" y="94" font-size="32" font-weight="bold" fill="#3859ec">Destka.</text>
    <text x="64" y="186" font-size="42" font-weight="bold" fill="#171717">${xml(first)}</text>
    <text x="64" y="244" font-size="42" font-weight="bold" fill="#171717">${xml(second)}</text>
    <text x="64" y="304" font-size="22" fill="#525b70">${xml(Array.from(wall.creator.displayName).slice(0, 46).join(''))}</text>
    <text x="64" y="372" font-size="28" fill="#171717">${locale === 'ru' ? 'Одна стена. Десять мест. Твой автограф.' : 'One Wall. Ten places. Your autograph.'}</text>
    ${slots}<text x="64" y="584" font-size="24" fill="#3859ec">${locale === 'ru' ? 'Оставь свой след →' : 'Leave your mark →'}</text></svg>`;
  return sharp(Buffer.from(svg), { limitInputPixels: 1200 * 630 })
    .png()
    .toBuffer();
}
