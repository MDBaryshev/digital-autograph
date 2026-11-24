import type { WallDesignPodium } from '@digital-autograph/domain';

const diamond = {
  key: 'diamond',
  caption: 'Diamond',
  label: 'Diamond place',
  crown: 0,
} as const;
const gold = {
  key: 'gold',
  caption: 'Gold',
  label: 'Gold place',
  crown: 1,
} as const;
const silver = {
  key: 'silver',
  caption: 'Silver',
  label: 'Silver place',
  crown: 2,
} as const;
const bronze = {
  key: 'bronze',
  caption: 'Bronze',
  label: 'Bronze place',
  crown: 3,
} as const;

const classic = [gold, silver, bronze];
const jewels = [diamond, gold, silver];

export function wallPodiumPlace(place: number, style?: WallDesignPodium) {
  return (style === 'jewels' ? jewels : classic)[place - 1];
}
