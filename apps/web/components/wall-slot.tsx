'use client';
import { useLocale } from './locale-provider';

import { useState, type ReactNode } from 'react';
import { remainingPaymentTime } from '../lib/slot-time';
import { CubePreview, CubeViewer, type CubeDetails } from './autograph-cube';
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
  arrived = false,
  onAction,
  now = Date.now(),
  paidAction,
}: {
  slot: Slot;
  now?: number;
  paidAction?: ReactNode;
  apiOrigin: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  selected?: boolean;
  arrived?: boolean;
  onAction?: () => void;
}) {
  const { t } = useLocale();

  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const number = slot.position + 1;
  const podium = ['gold', 'silver', 'bronze'][slot.position];
  const podiumLabel = ['Gold place', 'Silver place', 'Bronze place'][
    slot.position
  ];
  const reserved = Boolean(slot.reservationExpiresAt);
  const protectedUntil =
    slot.takeoverAvailableAt && Date.parse(slot.takeoverAvailableAt) > now;
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
        onError={() => setFailedPath(mediaPath)}
      />
    ) : (
      <span>{slot.occupied ? '—' : '+'}</span>
    );
  const details: CubeDetails = {
    place: number,
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
      data-podium={podium}
      data-reserved={reserved || undefined}
      data-selected={selected ? '' : undefined}
      data-empty={slot.occupied ? undefined : ''}
      data-arrived={arrived ? '' : undefined}
      aria-label={t(`Slot ${number}`)}
    >
      {slot.occupied ? (
        <button
          type="button"
          className={styles.cubeOpen}
          aria-haspopup="dialog"
          disabled={reserved}
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
          disabled={actionDisabled || reserved}
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
          disabled={reserved}
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
          {!showMedia && (
            <div>
              <p>{t('Autograph unavailable')}</p>
              {mediaPath && (
                <button
                  type="button"
                  disabled={reserved}
                  onClick={() => setFailedPath(null)}
                >
                  {t('Retry autograph')}
                </button>
              )}
            </div>
          )}
          <p>
            {t('Current placement')}
            {details.detail ? ` · ${details.detail}` : ''}
          </p>
          {protectedUntil && !reserved && (
            <p>
              {t('Protected from takeover for')}{' '}
              <span role="timer" aria-live="off">
                {remainingPaymentTime(slot.takeoverAvailableAt!, now)}
              </span>
            </p>
          )}
          {paidAction && (
            <div className={reserved ? styles.reservationAction : undefined}>
              {paidAction}
            </div>
          )}
        </div>
      ) : !actionLabel ? (
        <p className={styles.emptyLabel}>{t('Empty slot')}</p>
      ) : null}
      {!slot.occupied && actionLabel && (
        <button
          type="button"
          className={styles.cubeInspect}
          aria-haspopup="dialog"
          disabled={reserved}
          aria-label={t('Explore cube in slot {place}', { place: number })}
          onClick={() => setViewing(true)}
        >
          {t('Rotate cube')}
        </button>
      )}
      {viewing && (
        <CubeViewer details={details} onClose={() => setViewing(false)} />
      )}
      {reserved && (
        <div className={styles.reservationOverlay}>
          <strong>{t('Reserved for payment')}</strong>
          <span role="timer" aria-live="off">
            {Date.parse(slot.reservationExpiresAt!) > now
              ? remainingPaymentTime(slot.reservationExpiresAt!, now)
              : t('Checking availability…')}
          </span>
          <small>
            {t(
              'The buyer has 5 minutes to pay. Availability is confirmed by the server.',
            )}
          </small>
        </div>
      )}
    </li>
  );
}
