'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  defaultCubeCamera,
  type CubeCamera,
} from '../lib/community-cube-camera';

type Rotation = { x: number; y: number };
type Setter<T> = Dispatch<SetStateAction<T>>;
export const faceTurnAngles: Rotation[] = [
  { x: 0, y: 0 },
  { x: 0, y: -90 },
  { x: 0, y: -180 },
  { x: 0, y: 90 },
  { x: -90, y: 0 },
  { x: 90, y: 0 },
];

export function useCubeFaceTurn({
  camera,
  face,
  setCamera,
  setFace,
  setRotation,
}: {
  camera: CubeCamera;
  face: number;
  setCamera: Setter<CubeCamera>;
  setFace: Setter<number>;
  setRotation: Setter<Rotation>;
}) {
  const [phase, setPhase] = useState<
    'zooming-out' | 'turning' | 'focusing' | null
  >(null);
  const motion = useRef<{
    frame: number | null;
    timer: ReturnType<typeof setTimeout> | null;
    version: number;
  }>({ frame: null, timer: null, version: 0 });
  const clear = () => {
    const current = motion.current;
    current.version++;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    if (current.timer !== null) clearTimeout(current.timer);
    current.frame = null;
    current.timer = null;
  };
  useEffect(
    () => () => {
      clear();
    },
    [],
  );
  const cancel = () => {
    clear();
    setPhase(null);
  };
  const turnTo = (
    index: number,
    onTurn?: () => void,
    focusCamera?: CubeCamera,
  ) => {
    clear();
    const version = motion.current.version;
    const target = faceTurnAngles[index]!;
    const rotate = () => {
      if (motion.current.version !== version) return;
      setFace(index);
      onTurn?.();
      setRotation((previous) => ({
        x: focusCamera ? target.x : target.x === 0 ? -16 : target.x * 0.82,
        y:
          target.y -
          (focusCamera ? 0 : 24) +
          360 *
            Math.round(
              (previous.y - (target.y - (focusCamera ? 0 : 24))) / 360,
            ),
      }));
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCamera(focusCamera ?? { ...defaultCubeCamera });
      rotate();
      setPhase(null);
      return;
    }
    const flyIn = () => {
      if (!focusCamera || motion.current.version !== version) return;
      setPhase('focusing');
      let start: number | undefined;
      const step = (now: number) => {
        if (motion.current.version !== version) return;
        start ??= now;
        const progress = Math.min(1, (now - start) / 980);
        const eased = progress ** 3 * (progress * (progress * 6 - 15) + 10);
        setCamera({
          zoom: Math.exp(Math.log(focusCamera.zoom) * eased),
          x: 0.5 + (focusCamera.x - 0.5) * eased,
          y: 0.5 + (focusCamera.y - 0.5) * eased,
        });
        if (progress < 1) motion.current.frame = requestAnimationFrame(step);
        else {
          motion.current.frame = null;
          setPhase(null);
        }
      };
      motion.current.frame = requestAnimationFrame(step);
    };
    const startTurn = () => {
      if (motion.current.version !== version) return;
      setCamera({ ...defaultCubeCamera });
      setPhase('turning');
      // The old face must be painted as a full 3D cube before its transform changes.
      motion.current.frame = requestAnimationFrame(() => {
        motion.current.frame = requestAnimationFrame(() => {
          rotate();
          motion.current.timer = setTimeout(() => {
            if (motion.current.version === version) {
              motion.current.timer = null;
              if (focusCamera) flyIn();
              else setPhase(null);
            }
          }, 760);
        });
      });
    };
    if (camera.zoom <= 1) {
      setPhase('turning');
      startTurn();
      return;
    }
    setRotation(faceTurnAngles[face]!);
    setPhase('zooming-out');
    const from = { ...camera };
    let start: number | undefined;
    const step = (now: number) => {
      if (motion.current.version !== version) return;
      start ??= now;
      const progress = Math.min(1, (now - start) / 420);
      const eased = 1 - (1 - progress) ** 3;
      setCamera({
        zoom: Math.exp(Math.log(from.zoom) * (1 - eased)),
        x: from.x + (0.5 - from.x) * eased,
        y: from.y + (0.5 - from.y) * eased,
      });
      if (progress < 1) motion.current.frame = requestAnimationFrame(step);
      else startTurn();
    };
    motion.current.frame = requestAnimationFrame(step);
  };
  return { phase, turnTo, cancel };
}
