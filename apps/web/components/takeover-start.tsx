'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';

const RESERVATION_REQUEST_TIMEOUT_MS = 10_000;

// Mounted only when the reviewed paid-takeover release capability is enabled.
// Reserve on an explicit checkout action, never on hover, render or quote display.
export function TakeoverStart({
  apiOrigin,
  wallId,
  slotId,
  autographId,
  reserved = false,
  protectedUntil = false,
  now = Date.now(),
  onReserved,
}: {
  apiOrigin: string;
  wallId: string;
  slotId: string;
  autographId: string;
  reserved?: boolean;
  protectedUntil?: boolean;
  now?: number;
  onReserved: () => void;
}) {
  const { t } = useLocale();
  const attempt = useRef<{ quoteId?: string; key: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const storageKey = `destka-checkout:${apiOrigin}:${wallId}:${slotId}`;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (
        saved &&
        typeof saved.quoteId === 'string' &&
        saved.quoteId.length <= 64 &&
        typeof saved.key === 'string' &&
        /^[A-Za-z0-9._~-]{16,128}$/.test(saved.key)
      )
        attempt.current = { quoteId: saved.quoteId, key: saved.key };
    } catch {
      /* Storage can be unavailable; in-memory retries still work. */
    }
    setHydrated(true);
    return () => {
      const controller = request.current;
      request.current = null;
      controller?.abort();
    };
  }, [storageKey]);
  function forgetAttempt() {
    attempt.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Best effort. */
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<{
    reservationId: string;
    expiresAt: string;
  } | null>(null);

  async function post(
    path: string,
    body: object,
    signal: AbortSignal,
    key?: string,
  ) {
    const response = await fetch(`${apiOrigin}${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: JSON.stringify(body),
    });
    signal.throwIfAborted();
    const data = await response.json();
    signal.throwIfAborted();
    if (!response.ok) throw new Error(data.error?.code ?? 'UNAVAILABLE');
    return data;
  }

  async function requestReservation(signal: AbortSignal) {
    const current = attempt.current ?? { key: crypto.randomUUID() };
    attempt.current = current;
    if (!current.quoteId) {
      const quote = await post(
        `/walls/${encodeURIComponent(wallId)}/slots/${encodeURIComponent(slotId)}/takeover-quote`,
        {},
        signal,
      );
      current.quoteId = quote.id;
      // Opaque retry information only, never auth/provider credentials.
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(current));
      } catch {
        /* Best effort. */
      }
    }
    return post(
      '/takeover-reservations',
      { quoteId: current.quoteId },
      signal,
      current.key,
    );
  }

  async function reserve() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    if (checkout && Date.parse(checkout.expiresAt) <= now) {
      forgetAttempt();
      setCheckout(null);
    }

    const { signal } = controller;
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(signal.reason);
      signal.addEventListener('abort', rejectAbort, { once: true });
    });
    const deadline = window.setTimeout(
      () => controller.abort(),
      RESERVATION_REQUEST_TIMEOUT_MS,
    );
    try {
      const reservation = await Promise.race([
        aborted,
        requestReservation(signal),
      ]);
      if (request.current !== controller) return;
      if (reservation.status !== 'active') {
        forgetAttempt();
        throw new Error('QUOTE_EXPIRED');
      }
      setCheckout({
        reservationId: reservation.id,
        expiresAt: reservation.expiresAt,
      });
      onReserved();
    } catch (cause) {
      if (request.current !== controller) return;
      const code = cause instanceof Error ? cause.message : '';
      const unavailable = [
        'SLOT_RESERVED',
        'QUOTE_EXPIRED',
        'QUOTE_TARGET_STALE',
        'QUOTE_ALREADY_RESERVED',
        'QUOTE_NOT_FOUND',
        'IDEMPOTENCY_KEY_REUSED',
        'TAKEOVER_COOLDOWN_ACTIVE',
      ].includes(code);
      if (unavailable) {
        forgetAttempt();
        onReserved();
      }
      setError(
        unavailable
          ? 'This slot is reserved or no longer available. Refresh the Wall.'
          : 'Could not reserve. Retry the same request.',
      );
    } finally {
      window.clearTimeout(deadline);
      signal.removeEventListener('abort', rejectAbort);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  if (!hydrated || (reserved && !attempt.current)) return null;
  const activeCheckout = checkout && Date.parse(checkout.expiresAt) > now;
  return (
    <div>
      {activeCheckout ? (
        <a
          href={`/payments/checkout?${new URLSearchParams({ reservationId: checkout.reservationId, autographId })}`}
        >
          {t('Continue to payment')}
        </a>
      ) : (
        <button
          type="button"
          disabled={
            busy ||
            protectedUntil ||
            (reserved && Boolean(checkout) && !activeCheckout)
          }
          onClick={() => void reserve()}
        >
          {t(
            busy
              ? 'Reserving…'
              : attempt.current?.quoteId
                ? 'Resume reservation'
                : 'Reserve for 5 minutes',
          )}
        </button>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
