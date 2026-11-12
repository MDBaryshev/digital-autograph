'use client';
import { useLocale } from './locale-provider';

import { useState } from 'react';
import { placementSourceLabel } from '../lib/placement-history-api';
import type { PublicWall } from '../lib/public-wall-api';
import styles from '../app/walls/[id]/page.module.css';

type Slot = PublicWall['slots'][number];

export function WallSlot({
  slot,
  apiOrigin,
  actionLabel,
  actionDisabled = false,
  selected = false,
  onAction,
}: {
  slot: Slot;
  apiOrigin: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  selected?: boolean;
  onAction?: () => void;
}) {
  const { t } = useLocale();

  const [failedPath, setFailedPath] = useState<string | null>(null);
  const number = slot.position + 1;
  const podium = ['gold', 'silver', 'bronze'][slot.position];
  const podiumLabel = ['Gold place', 'Silver place', 'Bronze place'][
    slot.position
  ];
  const mediaPath = slot.currentPlacement?.mediaPath;
  const showMedia = Boolean(mediaPath && failedPath !== mediaPath);

  return (
    <li
      id={`slot-${slot.id}`}
      tabIndex={-1}
      className={styles.slot}
      data-podium={podium}
      data-selected={selected ? '' : undefined}
      aria-label={t(`Slot ${number}`)}
    >
      <span className={styles.slotNumber}>
        {podium && (
          <svg
            className={styles.crown}
            viewBox="0 0 32 26"
            role="img"
            aria-label={t(podiumLabel!)}
          >
            <path
              d="M4 8 10 13 16 3 22 13 28 8 25 22H7Z"
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
          {showMedia && mediaPath ? (
            <img
              ref={(image) => {
                // A server-rendered image may fail before React attaches onError.
                if (image?.complete && image.naturalWidth === 0)
                  setFailedPath(mediaPath);
              }}
              className={styles.autograph}
              src={`${apiOrigin}${mediaPath}`}
              alt={t(`Digital autograph in slot ${number}`)}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setFailedPath(mediaPath)}
            />
          ) : (
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
            {slot.currentPlacement
              ? ` · ${t(placementSourceLabel(slot.currentPlacement.source))}`
              : ''}
          </p>
        </div>
      ) : actionLabel ? (
        <button
          id={`slot-action-${slot.id}`}
          className={styles.slotAction}
          type="button"
          disabled={actionDisabled}
          aria-expanded={selected}
          onClick={onAction}
        >
          <span className={styles.emptyMark} aria-hidden="true">
            +
          </span>
          {t(actionLabel)}
        </button>
      ) : (
        <div className={styles.slotContent}>
          <span className={styles.emptyMark} aria-hidden="true">
            +
          </span>
          <p>{t('Empty slot')}</p>
        </div>
      )}
    </li>
  );
}
