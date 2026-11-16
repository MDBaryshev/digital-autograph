'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { occupiedOnFace, isCubeCellOccupied } from '../lib/community-cube';
import {
  boundedCubeCamera,
  desktopCubeMedia,
  cubeFaceGrid,
  defaultCubeCamera,
  maxCubeZoom,
  zoomCubeCamera,
  type CubeCamera,
} from '../lib/community-cube-camera';
import {
  format,
  inks,
  names,
  papers,
  paintMark,
  type PersonalMark,
  personalCubeSlot,
} from '../lib/community-cube-art';
import { Icon } from './ui-icon';
import styles from './community-cube.module.css';

type SetCamera = Dispatch<SetStateAction<CubeCamera>>;

export function CubeZoomControls({
  camera,
  setCamera,
  personal,
  onFind,
  disabled = false,
}: {
  camera: CubeCamera;
  setCamera: SetCamera;
  personal: PersonalMark | null;
  onFind: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.zoomToolbar}>
      <div
        className={styles.zoomControls}
        role="group"
        aria-label="Приближение грани"
      >
        <button
          type="button"
          aria-label="Уменьшить масштаб"
          disabled={disabled || camera.zoom <= 1}
          onClick={() =>
            setCamera((previous) =>
              zoomCubeCamera(previous, previous.zoom / 1.6),
            )
          }
        >
          −
        </button>
        <input
          aria-label="Масштаб грани"
          type="range"
          min="0"
          max="6"
          step=".01"
          value={Math.log2(camera.zoom)}
          disabled={disabled}
          onChange={(event) => {
            const zoom = 2 ** Number(event.target.value);
            setCamera((previous) => zoomCubeCamera(previous, zoom));
          }}
        />
        <button
          type="button"
          aria-label="Увеличить масштаб"
          disabled={disabled || camera.zoom >= maxCubeZoom}
          onClick={() =>
            setCamera((previous) =>
              zoomCubeCamera(previous, previous.zoom * 1.6),
            )
          }
        >
          +
        </button>
        <output aria-label="Текущий масштаб">
          ×{camera.zoom.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
        </output>
        <button
          type="button"
          className={styles.overviewButton}
          disabled={disabled}
          onClick={() => setCamera({ ...defaultCubeCamera })}
        >
          Куб целиком
        </button>
      </div>
      <button
        type="button"
        className={styles.findMine}
        disabled={disabled || !personal}
        onClick={onFind}
        title={
          personal
            ? 'Показать мою ячейку крупно'
            : 'Сначала добавь свой автограф'
        }
      >
        <Icon name="user" size={16} /> К моему автографу
      </button>
      {!personal && (
        <small className={styles.zoomHint}>
          Добавь автограф, чтобы быстро возвращаться к нему.
        </small>
      )}
    </div>
  );
}

export function CubeFaceNavigator({
  count,
  generation,
  face,
  personal,
  camera,
  setCamera,
  animateCamera = setCamera,
  onChoose,
}: {
  count: number;
  generation: number;
  face: number;
  personal: PersonalMark | null;
  camera: CubeCamera;
  setCamera: SetCamera;
  animateCamera?: SetCamera;
  onChoose?: (id: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const { rows, columns, perFace } = cubeFaceGrid(generation);
  const occupied = occupiedOnFace(
    count,
    perFace,
    face,
    personalCubeSlot(personal),
  );
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const resize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      // The desktop workspace has no page scroll, so its wheel controls zoom.
      // Touch devices retain page scrolling; trackpad pinch uses ctrlKey.
      if (!event.ctrlKey && !window.matchMedia(desktopCubeMedia).matches)
        return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const edge = Math.min(rect.width, rect.height) * 0.72;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      animateCamera((previous) =>
        zoomCubeCamera(
          previous,
          previous.zoom *
            Math.exp(-Math.max(-400, Math.min(400, delta)) * 0.003),
          {
            x: (event.clientX - rect.left - rect.width / 2) / edge,
            y: (event.clientY - rect.top - rect.height / 2) / edge,
          },
        ),
      );
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [animateCamera]);
  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const widthInPixels = Math.max(1, Math.round(size.width * ratio));
    const heightInPixels = Math.max(1, Math.round(size.height * ratio));
    if (node.width !== widthInPixels) node.width = widthInPixels;
    if (node.height !== heightInPixels) node.height = heightInPixels;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#e8dfd0';
    ctx.fillRect(0, 0, size.width, size.height);
    const edge = Math.min(size.width, size.height) * 0.72 * camera.zoom;
    const left = size.width / 2 - camera.x * edge,
      top = size.height / 2 - camera.y * edge;
    const scale = edge / 1000,
      width = 948 / columns,
      height = 948 / rows;
    ctx.translate(left, top);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#e5d8c4';
    ctx.fillRect(0, 0, 1000, 1000);
    const firstColumn = Math.max(0, Math.floor((-left / scale - 26) / width));
    const lastColumn = Math.min(
      columns - 1,
      Math.floor(((size.width - left) / scale - 26) / width),
    );
    const firstRow = Math.max(0, Math.floor((-top / scale - 26) / height));
    const lastRow = Math.min(
      rows - 1,
      Math.floor(((size.height - top) / scale - 26) / height),
    );
    const gap = generation === 1 ? 14 : generation === 2 ? 6 : 2;
    const detail = Math.min(1, Math.max(0, (camera.zoom - 1) / 1.2));
    for (let row = firstRow; row <= lastRow; row++)
      for (let column = firstColumn; column <= lastColumn; column++) {
        const cell = row * columns + column,
          id = face * perFace + cell + 1,
          filled = isCubeCellOccupied(id, count, personalCubeSlot(personal)),
          own = personalCubeSlot(personal) === id;
        const x = 26 + column * width,
          y = 26 + row * height;
        ctx.fillStyle = own
          ? '#f2d3b4'
          : filled
            ? papers[id % papers.length]!
            : '#ded1be';
        ctx.beginPath();
        ctx.roundRect(
          x + gap / 2,
          y + gap / 2,
          width - gap,
          height - gap,
          generation === 1 ? 12 : 3,
        );
        ctx.fill();
        ctx.strokeStyle = own ? '#a34427' : filled ? '#bda98b88' : '#b7a28566';
        const overviewLine = own ? 6 : 1;
        ctx.lineWidth =
          overviewLine + ((own ? 3 : 1) / scale - overviewLine) * detail;
        ctx.stroke();
        if (filled) {
          ctx.save();
          ctx.translate(x + width * 0.07, y + height * 0.1);
          ctx.scale((width * 0.86) / 150, (height * 0.72) / 90);
          ctx.strokeStyle = own ? '#a34427' : inks[id % inks.length]!;
          paintMark(ctx, id, personal);
          ctx.restore();
          if (perFace <= 24 && detail < 1) {
            ctx.globalAlpha = 1 - detail;
            ctx.font = `500 ${Math.min(14, width * 0.07)}px Manrope, sans-serif`;
            ctx.fillStyle = '#6b5946';
            ctx.fillText(
              own ? 'твой автограф' : `@${names[id % names.length]}`,
              x + width * 0.1,
              y + height * 0.88,
            );
            ctx.globalAlpha = 1;
          }
          if (width * scale > 80 && detail > 0) {
            ctx.globalAlpha = detail;
            ctx.font = `500 ${width * 0.065}px Manrope, sans-serif`;
            ctx.fillStyle = '#705137';
            ctx.fillText(
              own
                ? 'ТВОЙ АВТОГРАФ'
                : `№${format(id)} · @${names[id % names.length]}`,
              x + width * 0.08,
              y + height * 0.9,
            );
            ctx.globalAlpha = 1;
          }
        } else if (perFace <= 144 || width * scale > 30) {
          ctx.strokeStyle = '#9b896f88';
          ctx.lineWidth = 1.6 + (1.4 / scale - 1.6) * detail;
          const cross = width * (0.06 - detail * 0.01);
          ctx.beginPath();
          ctx.moveTo(x + width / 2 - cross, y + height / 2);
          ctx.lineTo(x + width / 2 + cross, y + height / 2);
          ctx.moveTo(x + width / 2, y + height / 2 - cross);
          ctx.lineTo(x + width / 2, y + height / 2 + cross);
          ctx.stroke();
        }
      }
  }, [
    size,
    camera,
    columns,
    rows,
    perFace,
    generation,
    face,
    occupied,
    count,
    personal,
  ]);
  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    setDragging(pointers.current.size > 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      ref={container}
      className={styles.faceNavigator}
      role="group"
      tabIndex={0}
      aria-label="Приближенная грань. Перемещайте мышью, двумя пальцами или стрелками. Плюс и минус меняют масштаб."
      data-camera-zoom={camera.zoom}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      data-face={face}
      data-dragging={dragging || undefined}
      onKeyDown={(event) => {
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          setCamera((previous) =>
            boundedCubeCamera({
              ...previous,
              x:
                previous.x +
                (event.key === 'ArrowLeft'
                  ? -0.12
                  : event.key === 'ArrowRight'
                    ? 0.12
                    : 0) /
                  previous.zoom,
              y:
                previous.y +
                (event.key === 'ArrowUp'
                  ? -0.12
                  : event.key === 'ArrowDown'
                    ? 0.12
                    : 0) /
                  previous.zoom,
            }),
          );
        } else if (
          event.key === '+' ||
          event.key === '=' ||
          event.key === '-'
        ) {
          event.preventDefault();
          animateCamera((previous) =>
            zoomCubeCamera(
              previous,
              previous.zoom * (event.key === '-' ? 1 / 1.6 : 1.6),
            ),
          );
        } else if (event.key === 'Home') {
          event.preventDefault();
          animateCamera({ ...defaultCubeCamera });
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.pointerType !== 'touch') event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        if (pointers.current.size === 0) {
          moved.current = false;
          start.current = { x: event.clientX, y: event.clientY };
        } else moved.current = true;
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const before = pointers.current.get(event.pointerId);
        if (!before) return;
        const oldPoints = [...pointers.current.values()];
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const nextPoints = [...pointers.current.values()];
        if (
          Math.hypot(
            event.clientX - start.current.x,
            event.clientY - start.current.y,
          ) > 4
        )
          moved.current = true;
        const rect = event.currentTarget.getBoundingClientRect(),
          base = Math.min(rect.width, rect.height) * 0.72;
        if (oldPoints.length === 2) {
          const [a, b] = oldPoints as [
              { x: number; y: number },
              { x: number; y: number },
            ],
            [c, d] = nextPoints as [
              { x: number; y: number },
              { x: number; y: number },
            ];
          const beforeDistance = Math.hypot(a.x - b.x, a.y - b.y),
            afterDistance = Math.hypot(c.x - d.x, c.y - d.y);
          if (beforeDistance < 1) return;
          setCamera((previous) => {
            const next = zoomCubeCamera(
              previous,
              (previous.zoom * afterDistance) / beforeDistance,
              {
                x: ((a.x + b.x) / 2 - rect.left - rect.width / 2) / base,
                y: ((a.y + b.y) / 2 - rect.top - rect.height / 2) / base,
              },
            );
            return boundedCubeCamera({
              ...next,
              x: next.x + (a.x + b.x - c.x - d.x) / 2 / (base * next.zoom),
              y: next.y + (a.y + b.y - c.y - d.y) / 2 / (base * next.zoom),
            });
          });
        } else if (oldPoints.length === 1 && event.pointerType !== 'touch')
          setCamera((previous) =>
            boundedCubeCamera({
              ...previous,
              x:
                previous.x -
                (event.clientX - before.x) / (base * previous.zoom),
              y:
                previous.y -
                (event.clientY - before.y) / (base * previous.zoom),
            }),
          );
      }}
      onPointerUp={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        if (!moved.current && onChoose) {
          const rect = event.currentTarget.getBoundingClientRect(),
            edge = Math.min(rect.width, rect.height) * 0.72 * camera.zoom;
          const x =
              camera.x + (event.clientX - rect.left - rect.width / 2) / edge,
            y = camera.y + (event.clientY - rect.top - rect.height / 2) / edge;
          if (x >= 0.026 && x < 0.974 && y >= 0.026 && y < 0.974) {
            const cell =
              Math.floor(((y - 0.026) / 0.948) * rows) * columns +
              Math.floor(((x - 0.026) / 0.948) * columns);
            const id = face * perFace + cell + 1;
            onChoose(
              isCubeCellOccupied(id, count, personalCubeSlot(personal))
                ? id
                : null,
            );
          }
        }
        release(event);
      }}
      onPointerCancel={release}
      onLostPointerCapture={(event) => {
        pointers.current.delete(event.pointerId);
        setDragging(pointers.current.size > 0);
      }}
    >
      <canvas
        ref={canvas}
        aria-label={`Грань ${face + 1}: ${format(occupied)} из ${format(perFace)} ячеек занято`}
      />
      <span className={styles.navigatorHint}>
        <span className={styles.desktopHint}>
          Колесо — масштаб · тяни, чтобы перемещаться
        </span>
        <span className={styles.mobileHint}>
          Страница — одним пальцем · масштаб — двумя
        </span>
      </span>
    </div>
  );
}
