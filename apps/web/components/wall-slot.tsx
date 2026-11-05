'use client';
import { useLocale } from './locale-provider';

import { useState, type ReactNode } from 'react';
import { remainingPaymentTime } from '../lib/slot-time';
import { frontendCapabilities } from '../lib/frontend-capabilities';
import { placementSourceLabel } from '../lib/placement-history-api';
import type { PublicWall } from '../lib/public-wall-api';
import styles from '../app/walls/[id]/page.module.css';

type Slot = PublicWall['slots'][number];

export function WallSlot({
  slot,
  apiOrigin,
  actionLabel,
  actionDisabled = false,
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
  onAction?: () => void;
}) {
  const { t } = useLocale();

  const [failedPath, setFailedPath] = useState<string | null>(null);
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

  return (
    <li
      id={`slot-${slot.id}`}
      tabIndex={-1}
      className={styles.slot}
      data-podium={podium}
      data-reserved={reserved || undefined}
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
          {protectedUntil && !reserved && (
            <p>
              {t('Protected from takeover for')}{' '}
              <span role="timer" aria-live="off">
                {remainingPaymentTime(slot.takeoverAvailableAt!, now)}
              </span>
            </p>
          )}
          {frontendCapabilities.paidTakeover && (
            <div className={reserved ? styles.reservationAction : undefined}>
              {paidAction}
            </div>
          )}
          {!frontendCapabilities.paidTakeover && (
            <div>
              <button
                type="button"
                disabled
                aria-describedby={`takeover-unavailable-${slot.id}`}
              >
                {t('Paid takeover')}
              </button>
              <p id={`takeover-unavailable-${slot.id}`}>
                {t('Paid takeover is not available yet.')}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.slotContent}>
          <span className={styles.emptyMark} aria-hidden="true">
            +
          </span>
          <p>{t('Empty slot')}</p>
          {actionLabel && (
            <button
              id={`slot-action-${slot.id}`}
              type="button"
              disabled={actionDisabled || reserved}
              onClick={onAction}
            >
              {t(actionLabel)}
            </button>
          )}
        </div>
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
