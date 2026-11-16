/** Local concept only. These numbers do not represent registered accounts. */
export function cubeCapacity(generation: number) {
  if (!Number.isInteger(generation) || generation < 1 || generation > 10)
    throw new RangeError('Invalid cube generation');
  const perFace = 4 * 6 ** (generation - 1);
  return { perFace, total: perFace * 6 };
}

export function communityCubeState(signatures: number) {
  if (!Number.isSafeInteger(signatures) || signatures < 0)
    throw new RangeError('Invalid signature count');
  let generation = 1;
  while (signatures >= cubeCapacity(generation).total) generation++;
  const { perFace, total } = cubeCapacity(generation);
  let rows = Math.floor(Math.sqrt(perFace));
  while (perFace % rows !== 0) rows--;
  return {
    generation,
    perFace,
    total,
    rows,
    columns: perFace / rows,
    inherited: generation > 1 ? cubeCapacity(generation - 1).total : 0,
    filledFaces: Math.floor(signatures / perFace),
    remaining: total - signatures,
  };
}

export function isCubeCellOccupied(
  cell: number,
  count: number,
  personalSlot?: number,
) {
  const sequential = personalSlot && personalSlot > count ? count - 1 : count;
  return cell <= sequential || cell === personalSlot;
}

export function occupiedOnFace(
  count: number,
  perFace: number,
  face: number,
  personalSlot?: number,
) {
  const sequential = personalSlot && personalSlot > count ? count - 1 : count;
  const occupied = Math.min(perFace, Math.max(0, sequential - face * perFace));
  return (
    occupied +
    (personalSlot &&
    personalSlot > sequential &&
    Math.floor((personalSlot - 1) / perFace) === face
      ? 1
      : 0)
  );
}
