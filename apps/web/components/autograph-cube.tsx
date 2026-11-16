'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocale } from './locale-provider';
import { Icon } from './ui-icon';
import styles from './autograph-cube.module.css';

export type CubeDetails = {
  place: number;
  artwork: ReactNode;
  /** These are illustrative identities, never inferred from an auth provider. */
  demoName?: string;
  detail?: string;
  empty?: boolean;
};

const faceNames = ['Autograph', 'Profile', 'Links', 'Place'] as const;
const restAngle = { x: -16, y: -24 };

function RankCrown({ place }: { place: number }) {
  if (place < 1 || place > 3) return null;
  const outline = [
    'M3 10 9 16 12 7 18 14 24 3 30 14 36 7 39 16 45 10 41 34H7Z',
    'M6 12 16 20 24 6 32 20 42 12 38 34H10Z',
    'M9 18 18 23 24 14 30 23 39 18 36 34H12Z',
  ][place - 1];
  return (
    <svg
      className={styles.rankCrown}
      data-crown-rank={place}
      viewBox="0 0 48 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={outline} fill="currentColor" fillOpacity="0.12" />
      <path d={place === 3 ? 'M13 38h22' : 'M9 38h30'} />
      {place === 1 && <path d="m24 21 3 4-3 4-3-4Z" />}
    </svg>
  );
}

/** A hollow metal crown, built from capped segments in the cube's 3D space. */
function SolidCrown({ place }: { place: number }) {
  if (place < 1 || place > 3) return null;
  const rank = (place - 1) as 0 | 1 | 2;
  const height = ([32, 34, 28] as const)[rank];
  const tips = ([6, 5, 4] as const)[rank];
  const segments = tips * 16;
  const step = (Math.PI * 2) / segments;
  const width = 100 * Math.sin(step / 2);
  const radius = 50 * Math.cos(step / 2);
  const band = 9;
  const top = (angle: number) =>
    (height - band) * (1 - Math.pow((1 + Math.cos(angle * tips)) / 2, 1.5));
  return (
    <span
      className={styles.crown}
      data-solid-crown={place}
      aria-hidden="true"
      style={
        {
          '--crown-unit': 'calc(var(--cube-size) * 0.0094)',
          '--crown-height': height,
          '--crown-inner-inset': `calc(var(--crown-unit) * ${3.5 * Math.tan(step / 2)})`,
        } as CSSProperties
      }
    >
      {Array.from({ length: segments }, (_, index) => {
        const angle = index * step;
        const left = top(angle - step / 2);
        const right = top(angle + step / 2);
        const outline = (a: number, b: number) =>
          `polygon(0 ${(a / height) * 100}%, 100% ${(b / height) * 100}%, 100% 100%, 0 100%)`;
        const light = Math.cos(angle + 0.7);
        return (
          <span
            className={styles.crownWall}
            key={index}
            style={
              {
                width: `calc(var(--crown-unit) * ${width})`,
                '--crown-shade':
                  light > 0
                    ? `rgb(255 250 230 / ${light * 0.32})`
                    : `rgb(48 26 10 / ${-light * 0.24})`,
                transform: `translateX(-50%) rotateY(${angle}rad) translateZ(calc(var(--crown-unit) * ${radius}))`,
              } as CSSProperties
            }
          >
            <span
              className={styles.crownOutside}
              style={{ clipPath: outline(left, right) }}
            />
            <span
              className={styles.crownInside}
              style={{ clipPath: outline(right, left) }}
            />
            <span
              className={styles.crownEdge}
              style={{
                top: `calc(var(--crown-unit) * ${left})`,
                width: `calc(var(--crown-unit) * ${Math.hypot(width, right - left)})`,
                transform: `rotateZ(${Math.atan2(right - left, width)}rad) rotateX(-90deg)`,
              }}
            />
            {((place === 1 && index % 16 === 0) ||
              (place === 2 && index === 0)) && (
              <span className={styles.crownJewel} />
            )}
          </span>
        );
      })}
      {place === 1 && (
        <>
          {[0, 90].map((rotation) => (
            <span
              className={styles.crownArch}
              key={rotation}
              style={{ transform: `rotateY(${rotation}deg)` }}
            >
              {Array.from({ length: 20 }, (_, segment) => {
                const from = (segment / 20) * Math.PI;
                const to = ((segment + 1) / 20) * Math.PI;
                const x = 50 + 42 * Math.cos(from);
                const y = 23 - 35 * Math.sin(from);
                const dx = 42 * (Math.cos(to) - Math.cos(from));
                const dy = -35 * (Math.sin(to) - Math.sin(from));
                return (
                  <span
                    className={styles.crownArchLink}
                    key={segment}
                    style={{
                      left: `calc(var(--crown-unit) * ${x})`,
                      top: `calc(var(--crown-unit) * ${y})`,
                      width: `calc(var(--crown-unit) * ${Math.hypot(dx, dy) + 0.3})`,
                      transform: `rotateZ(${Math.atan2(dy, dx)}rad)`,
                    }}
                  />
                );
              })}
            </span>
          ))}
          <span className={styles.crownFinial}>
            <span />
            <span />
          </span>
        </>
      )}
    </span>
  );
}

function SlotPlaque({ place }: { place: number }) {
  return (
    <span className={styles.plaque} data-slot-plaque={place} aria-hidden="true">
      <span className={styles.plaqueFront}>
        № {String(place).padStart(2, '0')}
      </span>
      <span className={styles.plaqueBack}>
        № {String(place).padStart(2, '0')}
      </span>
      <span className={styles.plaqueLeft} />
      <span className={styles.plaqueRight} />
      <span className={styles.plaqueTop} />
      <span className={styles.plaqueBottom} />
    </span>
  );
}

export function CubeObject({
  details,
  rotation = restAngle,
  dragging = false,
}: {
  details: CubeDetails;
  rotation?: { x: number; y: number };
  dragging?: boolean;
}) {
  const { t } = useLocale();
  return (
    <span
      className={styles.object}
      data-cube-object
      data-dragging={dragging || undefined}
      data-material={
        ['gold', 'silver', 'bronze'][details.place - 1] ??
        (details.empty ? 'empty' : 'signature')
      }
      style={
        {
          '--rx': `${rotation.x}deg`,
          '--ry': `${rotation.y}deg`,
        } as CSSProperties
      }
    >
      <span className={`${styles.face} ${styles.front}`}>
        <span className={styles.faceIndex} aria-hidden="true">
          <RankCrown place={details.place} />
          {String(details.place).padStart(2, '0')}
        </span>
        <span className={styles.artwork}>{details.artwork}</span>
        <span className={styles.faceCaption} aria-hidden="true">
          {t(
            ['Gold', 'Silver', 'Bronze'][details.place - 1] ??
              (details.empty ? 'Your place' : 'Autograph'),
          )}
        </span>
      </span>
      <span className={`${styles.face} ${styles.right}`} aria-hidden="true">
        <span className={styles.faceIndex}>{t('Profile')}</span>
        <span className={styles.monogram}>
          {details.demoName?.slice(0, 1).toUpperCase() ?? 'd.'}
        </span>
        <span className={styles.faceName}>
          {details.demoName
            ? `@${details.demoName}`
            : t(details.empty ? 'Your place' : 'Autograph author')}
        </span>
        <span className={styles.faceCaption}>
          {t(
            details.demoName
              ? 'Demo profile'
              : details.empty
                ? 'Free place'
                : 'Profile not published',
          )}
        </span>
      </span>
      <span className={`${styles.face} ${styles.back}`} aria-hidden="true">
        <span className={styles.faceIndex}>{t('Links')}</span>
        {details.demoName ? (
          <span className={styles.channels}>
            <span>
              Telegram <span>↗</span>
            </span>
            <span>
              YouTube <span>↗</span>
            </span>
            <span>
              {t('Website')} <span>↗</span>
            </span>
          </span>
        ) : (
          <span className={styles.faceName}>{t('No public links')}</span>
        )}
        <span className={styles.faceCaption}>
          {t(details.demoName ? 'Example channels' : 'Added by the author')}
        </span>
      </span>
      <span className={`${styles.face} ${styles.left}`} aria-hidden="true">
        <span className={styles.faceIndex}>supcube</span>
        <span className={styles.edition}>
          {String(details.place).padStart(2, '0')}
        </span>
        <span className={styles.faceCaption}>{t('One of 10 places')}</span>
      </span>
      <span className={`${styles.face} ${styles.top}`} aria-hidden="true">
        {details.place <= 3 && <span className={styles.crownSeat} />}
        <span>supcube</span>
        <span>{String(details.place).padStart(2, '0')}</span>
      </span>
      <span className={`${styles.face} ${styles.bottom}`} aria-hidden="true">
        d.
      </span>
      {details.place <= 3 ? (
        <SolidCrown place={details.place} />
      ) : (
        <SlotPlaque place={details.place} />
      )}
    </span>
  );
}

export function CubePreview({ details }: { details: CubeDetails }) {
  return (
    <span className={styles.preview}>
      <span className={styles.shadow} aria-hidden="true" />
      <CubeObject details={details} />
    </span>
  );
}

export function CubeViewer({
  details,
  onClose,
}: {
  details: CubeDetails;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [rotation, setRotation] = useState(restAngle);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    rotation: typeof restAngle;
  } | null>(null);
  const face = ((Math.round(-rotation.y / 90) % 4) + 4) % 4;

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  const turn = (steps: number) =>
    setRotation(({ y }) => ({ x: -12, y: (Math.round(y / 90) + steps) * 90 }));
  const finishDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setRotation(({ x, y }) => ({
      x: Math.max(-32, Math.min(32, x)),
      y: Math.round(y / 90) * 90,
    }));
  };

  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className={styles.viewerHeader}>
        <div>
          <h2 id={`${id}-title`}>
            {t('Cube · place {place}', { place: details.place })}
          </h2>
          <p>
            {details.demoName
              ? t('Demo profile · @{name}', { name: details.demoName })
              : (details.detail ??
                t(details.empty ? 'Free place' : 'Current placement'))}
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('Close')}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.turntable}>
        <div
          className={styles.manipulator}
          tabIndex={0}
          role="group"
          aria-label={t('Rotate cube')}
          aria-describedby={`${id}-hint`}
          data-dragging={dragging || undefined}
          onKeyDown={(event) => {
            if (
              ![
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            if (event.key === 'ArrowLeft') turn(1);
            if (event.key === 'ArrowRight') turn(-1);
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
              setRotation(({ x, y }) => ({
                x: Math.max(
                  -55,
                  Math.min(55, x + (event.key === 'ArrowUp' ? -15 : 15)),
                ),
                y,
              }));
            if (event.key === 'Home') setRotation(restAngle);
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              rotation,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            setRotation({
              x: Math.max(
                -55,
                Math.min(
                  55,
                  start.rotation.x - (event.clientY - start.y) * 0.35,
                ),
              ),
              y: start.rotation.y + (event.clientX - start.x) * 0.55,
            });
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          <span className={styles.shadow} aria-hidden="true" />
          <CubeObject
            details={details}
            rotation={rotation}
            dragging={dragging}
          />
        </div>
        <div className={styles.rotationControls}>
          <button
            type="button"
            onClick={() => turn(1)}
            aria-label={t('Turn left')}
          >
            <Icon name="arrow" size={20} />
          </button>
          <p id={`${id}-hint`}>{t('Drag to rotate. Or use the arrow keys.')}</p>
          <button
            type="button"
            onClick={() => turn(-1)}
            aria-label={t('Turn right')}
          >
            <Icon name="arrow" size={20} />
          </button>
        </div>
      </div>
      <div
        className={styles.faceControls}
        role="group"
        aria-label={t('Cube faces')}
      >
        {faceNames.map((name, index) => (
          <button
            type="button"
            key={name}
            aria-pressed={face === index}
            onClick={() => setRotation({ x: -12, y: -index * 90 })}
          >
            {t(name)}
          </button>
        ))}
      </div>
      <div
        className={styles.faceDescription}
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>{t(faceNames[face]!)}</strong>
        <p>
          {details.empty && face !== 3
            ? t('Free place')
            : face === 0
              ? t('The autograph on the front of this cube.')
              : face === 1
                ? details.demoName
                  ? `@${details.demoName} · ${t('Demo profile')}`
                  : t('The author has not published a profile here.')
                : face === 2
                  ? details.demoName
                    ? t(
                        'Telegram, YouTube and a website: example channels, not real accounts.',
                      )
                    : t('The author has not published any links here.')
                  : t('Place {place} of 10.', { place: details.place })}
        </p>
      </div>
    </dialog>
  );
}
