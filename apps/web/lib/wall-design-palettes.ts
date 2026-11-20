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
];

const { accent, ...colors } = ultraviolet.colors;
export const ultravioletWallStyle = {
  colors,
  accent,
  theme: ultraviolet.theme,
  finish: ultraviolet.finish,
  pattern: ultraviolet.pattern,
};
