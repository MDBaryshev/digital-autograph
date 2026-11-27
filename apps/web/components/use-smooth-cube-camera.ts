'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  boundedCubeCamera,
  type CubeCamera,
} from '../lib/community-cube-camera';
import { faceTurnAngles } from './use-cube-face-turn';

type Setter = Dispatch<SetStateAction<CubeCamera>>;
type Rotation = { x: number; y: number };
type Stage = 'aligning' | 'approaching' | 'withdrawing' | 'revealing' | null;
const unfoldDuration = 560;

export function useSmoothCubeCamera(
  camera: CubeCamera,
  setCamera: Setter,
  {
    face,
    rotation,
    setRotation,
  }: {
    face: number;
    rotation: Rotation;
    setRotation: Dispatch<SetStateAction<Rotation>>;
  },
) {
  const current = useRef(camera);
  current.current = camera;
  const view = useRef({ face, rotation });
  view.current = { face, rotation };
  const saved = useRef<{ face: number; rotation: Rotation } | null>(null);
  const destination = useRef<CubeCamera | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<Stage>(null);
  const [stage, setStage] = useState<Stage>(null);
  const changeStage = useCallback((value: Stage) => {
    stageRef.current = value;
    setStage(value);
  }, []);
  const clearTasks = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (timer.current !== null) clearTimeout(timer.current);
    frame.current = null;
    timer.current = null;
    destination.current = null;
  }, []);
  useEffect(() => clearTasks, [clearTasks]);
  const cancel = useCallback(() => {
    clearTasks();
    saved.current = null;
    changeStage(null);
  }, [clearTasks, changeStage]);

  const flatRotation = useCallback(() => {
    const flat = faceTurnAngles[view.current.face]!;
    return {
      x: flat.x,
      y: flat.y + 360 * Math.round((view.current.rotation.y - flat.y) / 360),
    };
  }, []);
  const overviewRotation = useCallback(() => {
    if (saved.current?.face === view.current.face)
      return saved.current.rotation;
    const flat = flatRotation();
    return { x: flat.x === 0 ? -16 : flat.x * 0.82, y: flat.y - 24 };
  }, [flatRotation]);

  const reveal = useCallback(() => {
    clearTasks();
    changeStage('withdrawing');
    // Mount the cube at the same flat pose and size as the detailed canvas,
    // then reveal its depth only after that matching frame has been painted.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setRotation(overviewRotation());
        changeStage('revealing');
        timer.current = setTimeout(() => {
          timer.current = null;
          saved.current = null;
          changeStage(null);
        }, unfoldDuration);
      });
    });
  }, [clearTasks, changeStage, overviewRotation, setRotation]);

  const jump: Setter = useCallback(
    (action) => {
      clearTasks();
      const next =
        typeof action === 'function' ? action(current.current) : action;
      const wasZoomed = current.current.zoom > 1;
      current.current = next;
      setCamera(next);
      if (
        wasZoomed &&
        next.zoom === 1 &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        reveal();
      else changeStage(null);
    },
    [clearTasks, setCamera, reveal, changeStage],
  );

  const animate: Setter = useCallback(
    (action) => {
      // Accumulate wheel input against its destination, rather than the last
      // rendered frame. Input continues to work while the cube aligns its face.
      const target = boundedCubeCamera(
        typeof action === 'function'
          ? action(destination.current ?? current.current)
          : action,
      );
      destination.current = target;
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      if (reduced) {
        if (current.current.zoom === 1 && target.zoom > 1) {
          saved.current ??= { ...view.current };
          setRotation(flatRotation());
        } else if (target.zoom === 1 && current.current.zoom > 1) {
          setRotation(overviewRotation());
          saved.current = null;
        }
        jump(target);
        return;
      }
      const tween = () => {
        if (frame.current !== null) return;
        let previous: number | undefined;
        const step = (now: number) => {
          const end = destination.current;
          if (!end) return;
          const alpha =
            1 -
            Math.exp(
              -Math.min(40, previous === undefined ? 16 : now - previous) / 70,
            );
          previous = now;
          const value = current.current;
          const near =
            Math.abs(Math.log(end.zoom / value.zoom)) < 0.0003 &&
            Math.abs(end.x - value.x) < 0.00003 &&
            Math.abs(end.y - value.y) < 0.00003;
          const zoom = Math.exp(
            Math.log(value.zoom) + Math.log(end.zoom / value.zoom) * alpha,
          );
          const positionAlpha =
            Math.abs(end.zoom - value.zoom) > 0.00001
              ? (1 / value.zoom - 1 / zoom) / (1 / value.zoom - 1 / end.zoom)
              : alpha;
          const next = near
            ? end
            : {
                zoom,
                x: value.x + (end.x - value.x) * positionAlpha,
                y: value.y + (end.y - value.y) * positionAlpha,
              };
          current.current = next;
          setCamera(next);
          if (near) {
            frame.current = null;
            destination.current = null;
            if (end.zoom === 1) reveal();
            else changeStage(null);
          } else frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
      };
      if (current.current.zoom === 1 && target.zoom > 1) {
        if (
          stageRef.current === 'aligning' ||
          stageRef.current === 'approaching'
        )
          return;
        const returning =
          stageRef.current === 'revealing' ||
          stageRef.current === 'withdrawing';
        clearTasks();
        destination.current = target;
        if (!returning) saved.current = { ...view.current };
        setRotation(flatRotation());
        changeStage('aligning');
        timer.current = setTimeout(() => {
          timer.current = null;
          changeStage('approaching');
          tween();
        }, unfoldDuration);
        return;
      }
      if (current.current.zoom === 1 && target.zoom === 1) {
        if (stageRef.current) reveal();
        else clearTasks();
        return;
      }
      changeStage(target.zoom === 1 ? 'withdrawing' : null);
      tween();
    },
    [
      jump,
      clearTasks,
      changeStage,
      flatRotation,
      overviewRotation,
      reveal,
      setCamera,
      setRotation,
    ],
  );

  return { animate, jump, cancel, stage };
}
