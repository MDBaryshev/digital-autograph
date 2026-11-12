'use client';

import { useEffect, useRef, useState } from 'react';
import { drawingBounds, type Stroke } from '../lib/drawing';
import { CanvasEditor } from './canvas-editor';
import { useLocale } from './locale-provider';
import { SignatureArt } from './signature-art';
import { Icon } from './ui-icon';
import styles from './try-wall.module.css';

type Mark = { place: number; strokes: readonly Stroke[] };
const places = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function Ink({ strokes }: { strokes: readonly Stroke[] }) {
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

function DrawingDialog({
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
  onSave: (mark: Mark) => void;
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

export function TryWall() {
  const { t } = useLocale();
  const [editing, setEditing] = useState<number | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);

  return (
    <section
      className={styles.stage}
      aria-labelledby="try-wall-heading"
      data-ui
    >
      <div className={styles.header}>
        <div>
          <h2 id="try-wall-heading" tabIndex={-1}>
            {t('Try the Wall')}
          </h2>
          <p>
            {mark
              ? t('You signed the demo Wall.')
              : t('Pick a free place and draw right here.')}
          </p>
        </div>
        <span className={styles.badge}>{t('Demo')}</span>
      </div>
      <ol className={styles.grid} role="list">
        {places.map((place) => {
          const drawn = mark?.place === place;
          return place <= 3 ? (
            <li key={place} className={styles.sample}>
              <span className={styles.number} aria-hidden="true">
                {place}
              </span>
              <span className={styles.srOnly}>
                {t('Example autograph in place {place}', { place })}
              </span>
              <SignatureArt variant={place - 1} />
            </li>
          ) : (
            <li key={place} className={styles.place}>
              <button
                type="button"
                className={drawn ? styles.signed : undefined}
                data-first={place === 4 && !mark ? '' : undefined}
                aria-haspopup="dialog"
                aria-label={t(
                  drawn
                    ? 'Edit your autograph in place {place}'
                    : mark
                      ? 'Move your autograph to place {place}'
                      : 'Sign demo place {place}',
                  { place },
                )}
                onClick={() => setEditing(place)}
              >
                <span className={styles.number} aria-hidden="true">
                  {place}
                </span>
                {drawn ? (
                  <Ink strokes={mark.strokes} />
                ) : (
                  <Icon name="plus" size={23} />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.footer}>
        <span role="status">
          {mark
            ? t('Your autograph is in place {place}.', { place: mark.place })
            : t('No account needed')}
        </span>
        {mark ? (
          <a href="/autograph/create">
            {t('Go to studio')} <Icon name="arrow" size={17} />
          </a>
        ) : (
          <span aria-hidden="true">{t('10 places')}</span>
        )}
      </div>
      {editing !== null && (
        <DrawingDialog
          place={editing}
          initialStrokes={mark?.strokes}
          moving={Boolean(mark && mark.place !== editing)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setMark(next);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
