import {
  wallDesignHex,
  type WallDesignColors,
  type WallDesignStyle,
} from '@digital-autograph/domain';
import type { CSSProperties } from 'react';

function rgb(hex: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

function readableInk(hex: string) {
  const values = rgb(hex).map((component) => {
    const channel = component / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function customColor(value: string | undefined) {
  return value && wallDesignHex.test(value) ? value : undefined;
}

export function wallCubeColors(colors: WallDesignColors | undefined) {
  const front = customColor(colors?.cube);
  const sides = customColor(colors?.sides);
  if (!front || !sides) return { front: front ?? sides, sides: sides ?? front };

  const frontRGB = rgb(front);
  const sidesRGB = rgb(sides);
  const maxGap = Math.max(
    ...frontRGB.map((component, i) => Math.abs(component - sidesRGB[i]!)),
  );
  const allowedGap = 32;
  if (maxGap <= allowedGap) return { front, sides };

  // Bring only strongly opposed colors toward their midpoint, keeping each tint.
  const blend = (from: number[], to: number[]) =>
    '#' +
    from
      .map((component, i) => {
        const other = to[i]!;
        const difference = component - other;
        const softenedDifference =
          Math.sign(difference) *
          Math.round((Math.abs(difference) * allowedGap) / maxGap);
        return Math.round((component + other + softenedDifference) / 2)
          .toString(16)
          .padStart(2, '0');
      })
      .join('');
  return { front: blend(frontRGB, sidesRGB), sides: blend(sidesRGB, frontRGB) };
}

export function wallCubePaint(
  design: WallDesignStyle | undefined,
): CSSProperties | undefined {
  if (!design) return undefined;
  const { front: cube, sides } = wallCubeColors(design.colors);
  const frame = customColor(design.colors?.frame);
  const ink = customColor(design.colors?.ink);
  const glassBackdrop = ink && readableInk(ink);
  return {
    '--custom-cube-front': cube,
    '--custom-cube-side': sides,
    '--custom-cube-front-text': cube && readableInk(cube),
    '--custom-cube-side-text': sides && readableInk(sides),
    '--custom-cube-frame': frame,
    '--custom-cube-ink': ink,
    '--glass-stage-paper':
      glassBackdrop === '#000000' ? '#142032' : glassBackdrop && '#e4e9ec',
    '--glass-stage-text':
      glassBackdrop === '#000000' ? '#e9f3ff' : glassBackdrop && '#273848',
    '--custom-cube-rounding': design.frame === 'square' ? '0px' : undefined,
  } as CSSProperties;
}

export function wallDesignPresentation(design: WallDesignStyle | undefined) {
  if (!design) return {};
  const accent = customColor(design.accent) ?? '#91482f';
  const surface = customColor(design.colors?.surface);
  const cover = customColor(design.colors?.cover);
  return {
    'data-wall-theme': design.theme,
    'data-wall-layout': design.layout,
    'data-wall-podium': design.podium,
    'data-wall-align': design.alignment,
    'data-wall-crop': design.coverPosition,
    'data-wall-type': design.typeface,
    'data-wall-frame': design.frame,
    'data-wall-pattern': design.pattern,
    'data-wall-custom-surface': surface ? '' : undefined,
    'data-wall-custom-cover': cover ? '' : undefined,
    style: {
      ...wallCubePaint(design),
      '--wall-surface': surface,
      '--wall-surface-text': surface && readableInk(surface),
      '--wall-cover': cover,
      '--wall-heading':
        customColor(design.colors?.heading) ?? (cover && readableInk(cover)),
      '--wall-frame-color': customColor(design.colors?.frame),
      '--wall-accent': accent,
      '--wall-on-accent': readableInk(accent),
    } as CSSProperties,
  };
}
