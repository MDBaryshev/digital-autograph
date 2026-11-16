import { expect, it } from 'vitest';
import {
  communityCubeState,
  cubeCapacity,
  occupiedOnFace,
  isCubeCellOccupied,
} from './community-cube';

it('fits every autograph of the previous cube on exactly one new face', () => {
  for (let generation = 1; generation < 8; generation++) {
    const previous = cubeCapacity(generation);
    const next = communityCubeState(previous.total);
    expect(next.generation).toBe(generation + 1);
    expect(next.perFace).toBe(previous.total);
    expect(next.inherited).toBe(previous.total);
    expect(next.rows * next.columns).toBe(next.perFace);
    expect(next.filledFaces).toBe(1);
    expect(occupiedOnFace(previous.total, next.perFace, 0)).toBe(next.perFace);
    expect(occupiedOnFace(previous.total, next.perFace, 1)).toBe(0);
  }
});

it('starts with four places on each side and grows only after the last autograph', () => {
  expect(communityCubeState(0)).toMatchObject({
    generation: 1,
    perFace: 4,
    total: 24,
    rows: 2,
    columns: 2,
  });
  expect(communityCubeState(23)).toMatchObject({ generation: 1, remaining: 1 });
  expect(communityCubeState(24)).toMatchObject({
    generation: 2,
    perFace: 24,
    total: 144,
  });
  expect(communityCubeState(143).generation).toBe(2);
  expect(communityCubeState(144)).toMatchObject({
    generation: 3,
    perFace: 144,
    total: 864,
  });
});

it('assigns every autograph one cell without counting inherited marks twice', () => {
  for (const count of [0, 1, 23, 24, 25, 96, 143, 144, 540, 864, 2800]) {
    const state = communityCubeState(count);
    expect(
      Array.from({ length: 6 }, (_, face) =>
        occupiedOnFace(count, state.perFace, face),
      ).reduce((a, b) => a + b, 0),
    ).toBe(count);
  }
});

it('counts an arbitrary personal cell once without filling the next sequential place', () => {
  expect(isCubeCellOccupied(144, 97, 144)).toBe(true);
  expect(isCubeCellOccupied(97, 97, 144)).toBe(false);
  expect(occupiedOnFace(97, 24, 4, 144)).toBe(0);
  expect(occupiedOnFace(97, 24, 5, 144)).toBe(1);
  for (let generation = 1; generation <= 4; generation++) {
    const { perFace, total } = cubeCapacity(generation);
    for (const count of [1, perFace, perFace + 1, total - 1, total]) {
      for (const own of [1, perFace + 1, total]) {
        const cells = Array.from({ length: total }, (_, i) =>
          isCubeCellOccupied(i + 1, count, own),
        );
        expect(cells.filter(Boolean)).toHaveLength(count);
        for (let face = 0; face < 6; face++)
          expect(occupiedOnFace(count, perFace, face, own)).toBe(
            cells.slice(face * perFace, (face + 1) * perFace).filter(Boolean)
              .length,
          );
      }
    }
  }
});

it('keeps the chosen physical cell when a full cube becomes the next cube front', () => {
  const next = communityCubeState(144);
  expect(occupiedOnFace(144, next.perFace, 0, 144)).toBe(144);
  expect(occupiedOnFace(144, next.perFace, 1, 144)).toBe(0);
  expect(isCubeCellOccupied(144, 144, 144)).toBe(true);
  expect(isCubeCellOccupied(145, 144, 144)).toBe(false);
});
