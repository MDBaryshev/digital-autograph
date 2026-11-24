'use client';

import { useEffect, useRef, useState } from 'react';
import { drawingBounds, type Stroke } from '../lib/drawing';
import { CanvasEditor } from './canvas-editor';
import { useLocale } from './locale-provider';
import { Icon } from './ui-icon';
import styles from './try-wall.module.css';

export type DemoMark = { place: number; strokes: readonly Stroke[] };
export function DemoInk({ strokes }: { strokes: readonly Stroke[] }) {
  const bounds = drawingBounds(strokes);
  if (!bounds) return null;
  const { left, top, width, height } = bounds;
  return (
    <svg
      viewBox={`${left} ${top} ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      {strokes.map(({ points }, index) => (
        <path
          key={index}
          d={points
            .map(({ x, y }, point) => `${point ? 'L' : 'M'}${x} ${y}`)
            .join(' ')}
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function DemoDrawingDialog({
  place,
  initialStrokes,
  moving,
  onClose,
  onSave,
}: {
  place: number;
  initialStrokes?: readonly Stroke[];
  moving: boolean;
  onClose: () => void;
  onSave: (mark: DemoMark) => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const strokes = useRef<readonly Stroke[]>(initialStrokes ?? []);
  const [hasMarks, setHasMarks] = useState(Boolean(initialStrokes));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => element?.close();
  }, []);

  const close = () => {
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog
      className={styles.dialog}
      ref={dialog}
      aria-labelledby="try-drawing-title"
      aria-describedby="try-drawing-note"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.dialogHeader}>
        <div>
          <h3 id="try-drawing-title" ref={heading} tabIndex={-1}>
            {t('Your autograph · place {place}', { place })}
          </h3>
          <p id="try-drawing-note">
            {t('This is a demo. Your drawing stays in this tab.')}
          </p>
        </div>
        <button
          className={styles.close}
          type="button"
          aria-label={t('Close')}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      <CanvasEditor
        compact
        initialStrokes={initialStrokes}
        onDrawingChange={setHasMarks}
        onStrokesChange={(next) => (strokes.current = next)}
      />
      <button
        type="button"
        className={styles.show}
        disabled={!hasMarks}
        onClick={() => {
          dialog.current?.close();
          onSave({ place, strokes: strokes.current });
        }}
      >
        {t(moving ? 'Move to this place' : 'Show on the demo Wall')}{' '}
        <Icon name="arrow" size={18} />
      </button>
    </dialog>
  );
}
