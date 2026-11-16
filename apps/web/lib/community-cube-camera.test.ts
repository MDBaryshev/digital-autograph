import { expect, it } from 'vitest';
import { communityCubeState, cubeCapacity } from './community-cube';
import {
  boundedCubeCamera,
  cubeFaceGrid,
  focusCubeAutograph,
  zoomCubeCamera,
} from './community-cube-camera';

it('centers the exact autograph cell on all six faces at every preview scale', () => {
  for (let generation = 1; generation <= 4; generation++) {
    const { columns, rows, perFace } = cubeFaceGrid(generation);
    for (const id of [1, perFace, perFace + 1, perFace * 4 + 1, perFace * 6]) {
      const target = focusCubeAutograph(id, generation);
      const column = Math.floor(((target.camera.x - 0.026) / 0.948) * columns);
      const row = Math.floor(((target.camera.y - 0.026) / 0.948) * rows);
      expect(target.face * perFace + row * columns + column + 1).toBe(id);
      // The full cell fits in the central 70% of the viewport, rather than
      // merely selecting its face or a distant cell with the same local index.
      expect(
        Math.max(0.948 / rows, 0.948 / columns) * 0.72 * target.camera.zoom,
      ).toBeCloseTo(0.7);
      expect(target.camera.zoom).toBeGreaterThan(1);
    }
  }
});

it('finds the same autograph after it moves onto the next cube front', () => {
  for (let generation = 1; generation < 4; generation++) {
    const count = cubeCapacity(generation).total;
    const id = count - 2;
    const before = focusCubeAutograph(id, generation);
    const after = focusCubeAutograph(id, communityCubeState(count).generation);
    expect(before.face).toBe(5);
    expect(after.face).toBe(0);
    expect(after.camera.zoom).toBeGreaterThan(before.camera.zoom);
  }
});

it('keeps the autograph under the cursor stationary while zooming', () => {
  const original = { zoom: 4, x: 0.4, y: 0.6 },
    anchor = { x: 0.21, y: -0.14 };
  const next = zoomCubeCamera(original, 32, anchor);
  expect(next.x + anchor.x / next.zoom).toBeCloseTo(
    original.x + anchor.x / original.zoom,
  );
  expect(next.y + anchor.y / next.zoom).toBeCloseTo(
    original.y + anchor.y / original.zoom,
  );
});

it('bounds zoom and panning, and returns to the centered overview at the lower limit', () => {
  expect(zoomCubeCamera({ zoom: 20, x: 0.3, y: 0.8 }, 500).zoom).toBe(64);
  expect(zoomCubeCamera({ zoom: 20, x: 0.3, y: 0.8 }, 0.01)).toEqual({
    zoom: 1,
    x: 0.5,
    y: 0.5,
  });
  expect(boundedCubeCamera({ zoom: 400, x: -10, y: 20 })).toEqual({
    zoom: 64,
    x: 0,
    y: 1,
  });
  expect(() => focusCubeAutograph(145, 2)).toThrow(RangeError);
});
