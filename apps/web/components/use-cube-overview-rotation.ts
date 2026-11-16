'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';

type Rotation = { x: number; y: number };
export function useCubeOverviewRotation({
  enabled,
  rotation,
  onRotate,
}: {
  enabled: boolean;
  rotation: Rotation;
  onRotate: (value: Rotation) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    rotation: Rotation;
    node: HTMLDivElement;
  } | null>(null);
  const release = () => {
    const current = drag.current;
    drag.current = null;
    if (current?.node.hasPointerCapture(current.id))
      current.node.releasePointerCapture(current.id);
  };
  useEffect(() => {
    if (!enabled) {
      release();
      setDragging(false);
    }
  }, [enabled]);
  useEffect(
    () => () => {
      release();
    },
    [],
  );
  const handlers: HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (event) => {
      if (
        !enabled ||
        drag.current ||
        event.isPrimary === false ||
        (event.pointerType === 'mouse' && event.button !== 0)
      )
        return;
      if (event.pointerType !== 'touch') {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        rotation: { ...rotation },
        node: event.currentTarget,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (!enabled || !current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x,
        dy = event.clientY - current.y;
      if (Math.hypot(dx, dy) < 4) return;
      // Keep one-finger vertical page scrolling on the mobile presentation.
      if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) return;
      setDragging(true);
      onRotate({
        x: Math.max(-85, Math.min(85, current.rotation.x - dy * 0.32)),
        y: current.rotation.y + dx * 0.38,
      });
    },
    onPointerUp: (event) => {
      if (drag.current?.id === event.pointerId) {
        release();
        setDragging(false);
      }
    },
    onPointerCancel: (event) => {
      if (drag.current?.id === event.pointerId) {
        release();
        setDragging(false);
      }
    },
    onLostPointerCapture: (event) => {
      if (drag.current?.id === event.pointerId) {
        drag.current = null;
        setDragging(false);
      }
    },
    onKeyDown: (event) => {
      if (
        !enabled ||
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      if (event.key === 'Home') onRotate({ x: -18, y: -28 });
      else
        onRotate({
          x: Math.max(
            -85,
            Math.min(
              85,
              rotation.x +
                (event.key === 'ArrowUp'
                  ? -12
                  : event.key === 'ArrowDown'
                    ? 12
                    : 0),
            ),
          ),
          y:
            rotation.y +
            (event.key === 'ArrowLeft'
              ? -12
              : event.key === 'ArrowRight'
                ? 12
                : 0),
        });
    },
  };
  return { dragging, handlers };
}
