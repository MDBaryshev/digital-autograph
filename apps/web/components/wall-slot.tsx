'use client';
import { useLocale } from './locale-provider';

import { useId, useState } from 'react';
import {
  wallCubeFinish,
  type WallDesignStyle,
} from '@digital-autograph/domain';
import { wallPodiumPlace } from '../lib/wall-podium';
import { wallCubePaint } from '../lib/wall-design-presentation';
import { CubePreview, CubeViewer, type CubeDetails } from './autograph-cube';
import { placementSourceLabel } from '../lib/placement-history-api';
import type { PublicWall } from '../lib/public-wall-api';
import styles from '../app/walls/[id]/page.module.css';

type Slot = PublicWall['slots'][number];

export function WallSlot({
  slot,
  apiOrigin,
  design,
  actionLabel,
  actionDisabled = false,
  selected = false,
  arrived = false,
  onAction,
}: {
  slot: Slot;
  apiOrigin: string;
  design?: WallDesignStyle;
  actionLabel?: string;
  actionDisabled?: boolean;
  selected?: boolean;
  arrived?: boolean;
  onAction?: () => void;
}) {
  const { t } = useLocale();
  const inkFilterId = useId();
  const ink = design?.colors?.ink;

  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const number = slot.position + 1;
  const podium = wallPodiumPlace(number, design?.podium);
  const mediaPath = slot.currentPlacement?.mediaPath;
  const showMedia = Boolean(mediaPath && failedPath !== mediaPath);

  const artwork =
    showMedia && mediaPath ? (
      <img
        ref={(image) => {
          if (image?.complete && image.naturalWidth === 0)
            setFailedPath(mediaPath);
        }}
        src={`${apiOrigin}${mediaPath}`}
        alt={t(`Digital autograph in slot ${number}`)}
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        data-tinted={ink ? '' : undefined}
        style={ink ? { filter: 'url(#' + inkFilterId + ')' } : undefined}
        onError={() => setFailedPath(mediaPath)}
      />
    ) : (
      <span>{slot.occupied ? '—' : '+'}</span>
    );
  const details: CubeDetails = {
    place: number,
    podium: design?.podium,
    paint: wallCubePaint(design),
    finish: design && wallCubeFinish(design, number),
    artwork,
    empty: !slot.occupied,
    detail: slot.currentPlacement
      ? t(placementSourceLabel(slot.currentPlacement.source))
      : undefined,
  };

  return (
    <li
      id={`slot-${slot.id}`}
      tabIndex={-1}
      className={styles.slot}
      data-podium={podium?.key}
      data-selected={selected ? '' : undefined}
      data-empty={slot.occupied ? undefined : ''}
      data-arrived={arrived ? '' : undefined}
      aria-label={t(`Slot ${number}`)}
    >
      {ink && showMedia && (
        <svg
          width="0"
          height="0"
          className={styles.inkFilter}
          aria-hidden="true"
        >
          <defs>
            <filter id={inkFilterId} colorInterpolationFilters="sRGB">
              <feFlood floodColor={ink} result="ink" />
              <feComposite in="ink" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
        </svg>
      )}
      {slot.occupied ? (
        <button
          type="button"
          className={styles.cubeOpen}
          aria-haspopup="dialog"
          aria-label={t('Explore cube in slot {place}', { place: number })}
          onClick={() => setViewing(true)}
        >
          <CubePreview details={details} />
        </button>
      ) : actionLabel ? (
        <button
          id={`slot-action-${slot.id}`}
          className={styles.slotAction}
          type="button"
          aria-label={t(actionLabel)}
          disabled={actionDisabled}
          aria-expanded={selected}
          onClick={onAction}
        >
          <CubePreview details={details} />
          <span>{t(actionLabel)}</span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.cubeOpen}
          aria-haspopup="dialog"
          aria-label={t('Explore cube in slot {place}', { place: number })}
          onClick={() => setViewing(true)}
        >
          <CubePreview details={details} />
        </button>
      )}
      <span className={styles.slotNumber}>
        {podium && (
          <svg
            className={styles.crown}
            viewBox="0 0 32 26"
            role="img"
            aria-label={t(podium.label)}
          >
            <path
              d={
                podium.key === 'diamond'
                  ? 'M4 7 9 2h14l5 5-12 16Z'
                  : 'M4 8 10 13 16 3 22 13 28 8 25 22H7Z'
              }
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M8 25H24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        {t('Slot ')}
        {number}
      </span>
      {slot.occupied ? (
        <div className={styles.slotContent}>
          {!showMedia && (
            <div>
              <p>{t('Autograph unavailable')}</p>
              {mediaPath && (
                <button type="button" onClick={() => setFailedPath(null)}>
                  {t('Retry autograph')}
                </button>
              )}
            </div>
          )}
          <p>
            {t('Current placement')}
            {details.detail ? ` · ${details.detail}` : ''}
          </p>
        </div>
      ) : !actionLabel ? (
        <p className={styles.emptyLabel}>{t('Empty slot')}</p>
      ) : null}
      {!slot.occupied && actionLabel && (
        <button
          type="button"
          className={styles.cubeInspect}
          aria-haspopup="dialog"
          aria-label={t('Explore cube in slot {place}', { place: number })}
          onClick={() => setViewing(true)}
        >
          {t('Rotate cube')}
        </button>
      )}
      {viewing && (
        <CubeViewer details={details} onClose={() => setViewing(false)} />
      )}
    </li>
  );
}
