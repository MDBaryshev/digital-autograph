'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { WallCubeFinish } from '@digital-autograph/domain';
import type { CrownMetal } from '../lib/crown-model';
import styles from './autograph-cube.module.css';

export function CrownStage({
  metal,
  finish,
  cube,
}: {
  metal: CrownMetal;
  finish?: WallCubeFinish;
  cube: RefObject<HTMLSpanElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const object = cube.current;
    const stage = canvas?.parentElement;
    if (!canvas || !object || !stage) return;
    let disposed = false;
    let stop = () => {};

    void import('../lib/crown-scene')
      .then(({ mountCrownScene }) => {
        if (disposed) return;
        const scene = mountCrownScene(canvas, metal, finish);
        let frame = 0;
        let animateUntil = 0;
        let lastDraw = '';
        let rendered = false;

        function draw(time: number) {
          frame = 0;
          if (!canvas || !stage || !object) return;
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          const edge = object.offsetWidth;
          if (width && height && edge) {
            const perspective =
              Number.parseFloat(getComputedStyle(stage).perspective) || 1200;
            const pose = getComputedStyle(object).transform;
            const x = object.offsetLeft + object.offsetWidth / 2 - width / 2;
            const y = height / 2 - (object.offsetTop + object.offsetHeight / 2);
            const inputs = [width, height, perspective, edge, pose, x, y].join(
              ' ',
            );
            if (inputs !== lastDraw) {
              scene.draw(
                width,
                height,
                perspective,
                edge,
                new DOMMatrixReadOnly(pose === 'none' ? undefined : pose),
                x,
                y,
              );
              lastDraw = inputs;
              if (!rendered) {
                rendered = true;
                setReady(true);
              }
            }
          }
          if (time < animateUntil) frame = requestAnimationFrame(draw);
        }

        function invalidate() {
          animateUntil = performance.now() + 280;
          if (!frame) frame = requestAnimationFrame(draw);
        }

        const resize = new ResizeObserver(invalidate);
        resize.observe(stage);
        resize.observe(object);
        const styles = new MutationObserver(invalidate);
        styles.observe(object, {
          attributes: true,
          attributeFilter: ['style', 'data-dragging'],
        });
        object.addEventListener('transitionrun', invalidate);
        const loseContext = () => {
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          animateUntil = 0;
          setReady(false);
          resize.disconnect();
          styles.disconnect();
          object.removeEventListener('transitionrun', invalidate);
        };
        canvas.addEventListener('webglcontextlost', loseContext);
        stop = () => {
          resize.disconnect();
          styles.disconnect();
          object.removeEventListener('transitionrun', invalidate);
          canvas.removeEventListener('webglcontextlost', loseContext);
          if (frame) cancelAnimationFrame(frame);
          scene.dispose();
        };
        invalidate();
      })
      .catch(() => {
        if (!disposed) setReady(false);
      });

    return () => {
      disposed = true;
      stop();
    };
  }, [cube, finish, metal]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.crownCanvas}
      data-crown-model={metal}
      data-crown-ready={ready ? '' : undefined}
      aria-hidden="true"
    />
  );
}
