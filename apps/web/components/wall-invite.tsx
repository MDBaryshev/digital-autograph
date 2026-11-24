'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import { wallInviteQr } from '../lib/wall-invite-qr';
import styles from '../app/walls/[id]/page.module.css';

export function WallInvite({
  wallId,
  title,
  apiOrigin,
}: {
  wallId: string;
  title: string;
  apiOrigin: string;
}) {
  const { t, locale } = useLocale();
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      setUrl(
        new URL('/walls/' + encodeURIComponent(wallId), window.location.origin)
          .href,
      ),
    [wallId],
  );
  const qr = useMemo(() => (url ? wallInviteQr(url) : null), [url]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Copy the link from the field below.');
      input.current?.focus();
      input.current?.select();
    }
  }
  async function share() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (e) {
          if (
            e &&
            typeof e === 'object' &&
            'name' in e &&
            e.name === 'AbortError'
          )
            return;
        }
      }
      await copy();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className={styles.invite} aria-label={t('Invite to this Wall')}>
      <h2>{t('Invite your people')}</h2>
      <p>
        {t(
          'One Wall. Ten places. Send the link to someone who should be here.',
        )}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!url || pending}
          onClick={() => void share()}
        >
          {t('Share invitation')}
        </button>
        <button
          type="button"
          disabled={!url || pending}
          onClick={() => void copy()}
        >
          {t('Copy Wall link')}
        </button>
        <a
          href={`${apiOrigin}/walls/${encodeURIComponent(wallId)}/invite-card?locale=${locale}`}
          target="_blank"
          rel="noreferrer"
        >
          {t('Open invitation card')}
        </a>
      </div>
      <label>
        {t('Wall invitation link')}
        <input
          className={styles.inviteUrl}
          ref={input}
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
        />
      </label>
      {message && <p role="status">{t(message)}</p>}
      {qr && (
        <details>
          <summary>{t('Show QR code')}</summary>
          <svg
            role="img"
            aria-label={t('QR code for this Wall')}
            className={styles.inviteQr}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            shapeRendering="crispEdges"
          >
            <rect width={qr.size} height={qr.size} fill="white" />
            <path d={qr.path} fill="black" />
          </svg>
          <a
            href={
              'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.svg)
            }
            download="supcube-wall-qr.svg"
          >
            {t('Download QR code')}
          </a>
        </details>
      )}
    </section>
  );
}
