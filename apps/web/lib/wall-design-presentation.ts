import { wallDesignHex, type WallDesignStyle } from '@digital-autograph/domain';
import type { CSSProperties } from 'react';

function readableInk(hex: string) {
  const values = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
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

export function wallCubePaint(
  design: WallDesignStyle | undefined,
): CSSProperties | undefined {
  if (!design) return undefined;
  const cube = customColor(design.colors?.cube);
  const sides = customColor(design.colors?.sides);
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
