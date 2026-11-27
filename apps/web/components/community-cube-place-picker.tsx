'use client';

import { useState, type CSSProperties } from 'react';
import { cubeFaceGrid } from '../lib/community-cube-camera';
import { isCubeCellOccupied, occupiedOnFace } from '../lib/community-cube';
import { drawingBounds, type Stroke } from '../lib/drawing';
import { format } from '../lib/community-cube-art';
import { SignatureArt } from './signature-art';
import { Icon } from './ui-icon';
import styles from './community-cube.module.css';

const faceNames = [
  'Лицевая',
  'Правая',
  'Обратная',
  'Левая',
  'Верхняя',
  'Нижняя',
];

export function DraftAutograph({ strokes }: { strokes: readonly Stroke[] }) {
  const bounds = drawingBounds(strokes);
  if (!bounds) return null;
  const padding = Math.max(bounds.width, bounds.height, 1) * 0.12;
  return (
    <svg
      viewBox={`${bounds.left - padding} ${bounds.top - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}
      fill="none"
      aria-label="Твой рисунок"
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.points.map(({ x, y }) => `${x},${y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}

export function CommunityCubePlacePicker({
  count,
  generation,
  strokes,
  onPlace,
  onBack,
}: {
  count: number;
  generation: number;
  strokes: readonly Stroke[];
  onPlace: (slot: number) => void;
  onBack: () => void;
}) {
  const { perFace, columns } = cubeFaceGrid(generation);
  const [face, setFace] = useState(() =>
    Math.min(5, Math.floor(count / perFace)),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const available = perFace - occupiedOnFace(count, perFace, face);
  const chosenFace =
    selected === null ? null : Math.floor((selected - 1) / perFace);
  return (
    <>
      <p className={styles.modalIntro}>
        Рисунок готов. Выбери грань и любую свободную ячейку — здесь останется
        твой почерк.
      </p>
      <div
        className={styles.placeFaces}
        role="group"
        aria-label="Грань для размещения"
      >
        {faceNames.map((name, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={face === index}
            onClick={() => setFace(index)}
          >
            {name}
            <small>
              {format(perFace - occupiedOnFace(count, perFace, index))} свободно
            </small>
          </button>
        ))}
      </div>
      <div className={styles.placeLegend}>
        <span>
          {faceNames[face]} грань · <b>{format(available)}</b> свободно из{' '}
          {format(perFace)}
        </span>
        <span>
          <i /> Свободная ячейка
        </span>
      </div>
      <div className={styles.placeScroll}>
        <div
          className={styles.placeGrid}
          role="group"
          aria-label={`Ячейки: ${faceNames[face]} грань`}
          style={{ '--place-columns': columns } as CSSProperties}
        >
          {Array.from({ length: perFace }, (_, index) => {
            const slot = face * perFace + index + 1;
            const occupied = isCubeCellOccupied(slot, count);
            return (
              <button
                type="button"
                key={slot}
                disabled={occupied}
                aria-label={`Ячейка № ${slot} — ${occupied ? 'занята' : 'свободна'}`}
                aria-pressed={selected === slot}
                onClick={() => setSelected(slot)}
              >
                {occupied ? (
                  <SignatureArt variant={slot} />
                ) : selected === slot ? (
                  <DraftAutograph strokes={strokes} />
                ) : (
                  <Icon name="plus" size={18} />
                )}
                <span>{slot}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.placeSelection} aria-live="polite">
        <div className={styles.draftPreview}>
          <DraftAutograph strokes={strokes} />
        </div>
        <div>
          <strong>
            {selected === null
              ? 'Твоё место ждёт'
              : `${faceNames[chosenFace!]} грань · ячейка № ${selected}`}
          </strong>
          <p>
            {selected === null
              ? 'Нажми на любую ячейку с плюсом.'
              : 'Твой автограф появится на выбранном месте.'}
          </p>
        </div>
      </div>
      <button
        className={styles.primary}
        type="button"
        disabled={selected === null || isCubeCellOccupied(selected, count)}
        onClick={() => {
          if (selected !== null && !isCubeCellOccupied(selected, count))
            onPlace(selected);
        }}
      >
        Разместить здесь <Icon name="arrow" size={18} />
      </button>
      <button className={styles.placeBack} type="button" onClick={onBack}>
        Изменить автограф
      </button>
      <p className={styles.placePrivacy}>
        Пока автограф сохраняется только на этой странице. Публикация в аккаунте
        ещё не подключена.
      </p>
    </>
  );
}
