import { cubeCapacity } from './community-cube';

export const maxCubeZoom = 64;
export const desktopCubeMedia = '(hover: hover) and (pointer: fine)';
export type CubeCamera = { zoom: number; x: number; y: number };
export const defaultCubeCamera: CubeCamera = { zoom: 1, x: 0.5, y: 0.5 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Face normals after the same rotateX/rotateY transform as the CSS cube. */
export function facingCubeFace(rotation: { x: number; y: number }) {
  const x = (rotation.x * Math.PI) / 180,
    y = (rotation.y * Math.PI) / 180;
  const depth = [
    Math.cos(x) * Math.cos(y),
    -Math.cos(x) * Math.sin(y),
    -Math.cos(x) * Math.cos(y),
    Math.cos(x) * Math.sin(y),
    -Math.sin(x),
    Math.sin(x),
  ];
  return depth.indexOf(Math.max(...depth));
}

export function cubeFaceGrid(generation: number) {
  const { perFace } = cubeCapacity(generation);
  let rows = Math.floor(Math.sqrt(perFace));
  while (perFace % rows) rows--;
  return { rows, columns: perFace / rows, perFace };
}

export function boundedCubeCamera(camera: CubeCamera): CubeCamera {
  return {
    zoom: clamp(camera.zoom, 1, maxCubeZoom),
    x: clamp(camera.x, 0, 1),
    y: clamp(camera.y, 0, 1),
  };
}

/** Anchor coordinates are screen offsets divided by the unzoomed face edge. */
export function zoomCubeCamera(
  camera: CubeCamera,
  zoom: number,
  anchor = { x: 0, y: 0 },
): CubeCamera {
  const nextZoom = clamp(zoom, 1, maxCubeZoom);
  if (nextZoom === 1) return { ...defaultCubeCamera };
  return boundedCubeCamera({
    zoom: nextZoom,
    x: camera.x + anchor.x / camera.zoom - anchor.x / nextZoom,
    y: camera.y + anchor.y / camera.zoom - anchor.y / nextZoom,
  });
}

export function focusCubeAutograph(id: number, generation: number) {
  const { rows, columns, perFace } = cubeFaceGrid(generation);
  if (!Number.isSafeInteger(id) || id < 1 || id > perFace * 6)
    throw new RangeError('Autograph is outside this cube');
  const cell = (id - 1) % perFace;
  return {
    face: Math.floor((id - 1) / perFace),
    camera: {
      zoom: Math.min(
        maxCubeZoom,
        0.7 / (0.72 * Math.max(0.948 / columns, 0.948 / rows)),
      ),
      x: 0.026 + (((cell % columns) + 0.5) * 0.948) / columns,
      y: 0.026 + ((Math.floor(cell / columns) + 0.5) * 0.948) / rows,
    },
  };
}
