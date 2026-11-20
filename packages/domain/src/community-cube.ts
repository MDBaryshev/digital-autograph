export const communityCubeMaxGeneration = 4;

export function communityCubeCapacity(generation: number): number {
  if (
    !Number.isInteger(generation) ||
    generation < 1 ||
    generation > communityCubeMaxGeneration
  ) {
    throw new RangeError('Invalid community cube generation');
  }
  return 24 * 6 ** (generation - 1);
}

export const communityCubeMaxCell = communityCubeCapacity(
  communityCubeMaxGeneration,
);
