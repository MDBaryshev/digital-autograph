export const wallDesignThemes = ['paper', 'stage', 'poster'] as const;
export const wallDesignLayouts = ['podium', 'gallery'] as const;
export const wallDesignAlignments = ['left', 'center'] as const;
export const wallDesignCoverPositions = ['top', 'center', 'bottom'] as const;
export const wallDesignTypefaces = ['display', 'editorial'] as const;
export const wallDesignFrames = ['soft', 'square'] as const;

const glassFinishes = ['glass', 'satin-glass', 'smoked-glass'] as const;

export const wallDesignFinishes = [
  'metallic',
  'brushed',
  ...glassFinishes,
  'matte',
  'enamel',
  'stone',
  'weave',
] as const;
export type WallCubeFinish = (typeof wallDesignFinishes)[number];

export function isWallGlassFinish(finish: WallCubeFinish | undefined) {
  return glassFinishes.some((glass) => glass === finish);
}
export const wallDesignPlaceKeys = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const;
export type WallDesignPlaceKey = (typeof wallDesignPlaceKeys)[number];
export const wallDesignPatterns = ['plain', 'grid', 'spotlight'] as const;
export const wallDesignColorKeys = [
  'surface',
  'cover',
  'heading',
  'frame',
  'cube',
  'sides',
  'ink',
] as const;
export type WallDesignColors = Partial<
  Record<(typeof wallDesignColorKeys)[number], string>
>;
export const wallDesignHex = /^#[0-9a-f]{6}$/i;

export type WallDesignStyle = {
  colors?: WallDesignColors;
  finish?: WallCubeFinish;
  placeFinishes?: Partial<Record<WallDesignPlaceKey, WallCubeFinish>>;
  pattern?: (typeof wallDesignPatterns)[number];
  theme: (typeof wallDesignThemes)[number];
  layout: (typeof wallDesignLayouts)[number];
  alignment: (typeof wallDesignAlignments)[number];
  coverPosition: (typeof wallDesignCoverPositions)[number];
  typeface: (typeof wallDesignTypefaces)[number];
  frame: (typeof wallDesignFrames)[number];
  accent: string;
  event: string;
  actionLabel: string;
};

export function wallCubeFinish(
  style: WallDesignStyle,
  place: number,
): WallCubeFinish {
  const key = wallDesignPlaceKeys[place - 1];
  return (key && style.placeFinishes?.[key]) || style.finish || 'metallic';
}

export type WallDesign = {
  title: string;
  description: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
  style: WallDesignStyle;
};

export const defaultWallDesignStyle: WallDesignStyle = {
  theme: 'paper',
  layout: 'podium',
  alignment: 'left',
  coverPosition: 'center',
  typeface: 'display',
  frame: 'soft',
  accent: '#91482f',
  event: '',
  actionLabel: '',
};

export const emptyWallDesign: WallDesign = {
  title: '',
  description: '',
  avatarDataUrl: null,
  coverDataUrl: null,
  style: defaultWallDesignStyle,
};
