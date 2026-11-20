import type {
  WallDesignColors,
  WallDesignStyle,
} from '@digital-autograph/domain';

type Palette = Required<WallDesignColors> & { accent: string };

type Preset = {
  label: string;
  theme: WallDesignStyle['theme'];
  colors: Palette;
  finish: NonNullable<WallDesignStyle['finish']>;
  pattern: NonNullable<WallDesignStyle['pattern']>;
};

const ultraviolet: Preset = {
  label: 'Ultraviolet',
  theme: 'stage',
  colors: {
    surface: '#19132c',
    cover: '#32205b',
    heading: '#fff5ff',
    frame: '#a385ff',
    cube: '#5a3cad',
    sides: '#292964',
    ink: '#e2ff8e',
    accent: '#dbff84',
  },
  finish: 'glass',
  pattern: 'spotlight',
};

export const wallDesignPalettes: Preset[] = [
  {
    label: 'Warm paper',
    theme: 'paper',
    colors: {
      surface: '#f5e8d2',
      cover: '#48261b',
      heading: '#fff1d7',
      frame: '#a97149',
      cube: '#f0c991',
      sides: '#c48e63',
      ink: '#48261b',
      accent: '#91482f',
    },
    finish: 'matte',
    pattern: 'plain',
  },
  ultraviolet,
  {
    label: 'Sunset poster',
    theme: 'poster',
    colors: {
      surface: '#341523',
      cover: '#7f3047',
      heading: '#fff0d7',
      frame: '#fa7a61',
      cube: '#ffc284',
      sides: '#d56d58',
      ink: '#52142c',
      accent: '#ffbc72',
    },
    finish: 'metallic',
    pattern: 'grid',
  },
  {
    label: 'Arctic chrome',
    theme: 'stage',
    colors: {
      surface: '#e5effa',
      cover: '#234682',
      heading: '#f2fffe',
      frame: '#5392ad',
      cube: '#b9e3fa',
      sides: '#5693bf',
      ink: '#143b7b',
      accent: '#7cf5d8',
    },
    finish: 'metallic',
    pattern: 'grid',
  },
  {
    label: 'Midnight graphite',
    theme: 'stage',
    colors: {
      surface: '#10161f',
      cover: '#202d3a',
      heading: '#f0f4fd',
      frame: '#6c849d',
      cube: '#3a5066',
      sides: '#263342',
      ink: '#e6e6fa',
      accent: '#a6d5fa',
    },
    finish: 'matte',
    pattern: 'grid',
  },
  {
    label: 'Jade atelier',
    theme: 'stage',
    colors: {
      surface: '#0e2722',
      cover: '#163f38',
      heading: '#eef8f3',
      frame: '#68a995',
      cube: '#3b7866',
      sides: '#28594e',
      ink: '#edf7cd',
      accent: '#86e5bc',
    },
    finish: 'satin-glass',
    pattern: 'spotlight',
  },
  {
    label: 'Lavender ink',
    theme: 'paper',
    colors: {
      surface: '#ebe5f4',
      cover: '#413055',
      heading: '#fdf7ff',
      frame: '#8f7aae',
      cube: '#c9b9df',
      sides: '#a99ac1',
      ink: '#302042',
      accent: '#e1c9fa',
    },
    finish: 'enamel',
    pattern: 'plain',
  },
  {
    label: 'Oxblood velvet',
    theme: 'poster',
    colors: {
      surface: '#241318',
      cover: '#4e202b',
      heading: '#fff0e9',
      frame: '#af687c',
      cube: '#9b5264',
      sides: '#773848',
      ink: '#ffe8c2',
      accent: '#ffc2b4',
    },
    finish: 'weave',
    pattern: 'spotlight',
  },
  {
    label: 'Lagoon',
    theme: 'stage',
    colors: {
      surface: '#e4f0f2',
      cover: '#163d54',
      heading: '#ecfbff',
      frame: '#5798ab',
      cube: '#80aebd',
      sides: '#6294ab',
      ink: '#123548',
      accent: '#9fefd8',
    },
    finish: 'glass',
    pattern: 'plain',
  },
  {
    label: 'Champagne',
    theme: 'paper',
    colors: {
      surface: '#f2ebe1',
      cover: '#5b473b',
      heading: '#fff4e4',
      frame: '#a78a70',
      cube: '#d6bb9e',
      sides: '#b89f87',
      ink: '#382820',
      accent: '#f9d5a5',
    },
    finish: 'brushed',
    pattern: 'plain',
  },
];

const { accent, ...colors } = ultraviolet.colors;
export const ultravioletWallStyle = {
  colors,
  accent,
  theme: ultraviolet.theme,
  finish: ultraviolet.finish,
  pattern: ultraviolet.pattern,
};
