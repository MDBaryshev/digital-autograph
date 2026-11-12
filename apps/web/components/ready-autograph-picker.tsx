'use client';
import { useLocale } from './locale-provider';

import { useEffect, useRef, useState } from 'react';
import { autographIdParams } from '@digital-autograph/contracts';
import { autographApi } from '../lib/autograph-api';
import type { ReadyAutographChoice } from '../lib/wall-claim-api';
import styles from '../app/walls/[id]/page.module.css';

type Preview = { url: string; expiresAt: string };

export function ReadyAutographPicker({
  choices,
  selectedId,
  onSelect,
  apiOrigin,
}: {
  choices: ReadyAutographChoice[];
  selectedId: string;
  onSelect: (id: string) => void;
  apiOrigin: string;
}) {
  const { t } = useLocale();

  const validSelection =
    choices.some((choice) => choice.id === selectedId) &&
    autographIdParams.safeParse({ id: selectedId }).success;

  return (
    <section className={styles.picker} aria-labelledby="ready-heading">
      <h2 id="ready-heading">{t('Choose your ready autograph')}</h2>
      <div className={styles.choices}>
        {choices.map((choice) => (
          <label key={choice.id} className={styles.choice}>
            <input
              type="radio"
              name="ready-autograph"
              value={choice.id}
              checked={choice.id === selectedId}
              onChange={() => onSelect(choice.id)}
            />
            <span>
              {choice.source === 'canvas' ? t('Drawn') : t('Photo')}
              {t(' autograph · moderated')}{' '}
              {new Date(choice.moderatedAt).toISOString().slice(0, 10)}
              {t(' UTC')}
            </span>
          </label>
        ))}
      </div>
      {validSelection && (
        <SelectedPreview
          key={JSON.stringify([apiOrigin, selectedId])}
          apiOrigin={apiOrigin}
          autographId={selectedId}
        />
      )}
    </section>
  );
}

function selectedPreview(value: unknown): Preview {
  if (!value || typeof value !== 'object') throw Error('INVALID_PREVIEW');
  const result = value as Record<string, unknown>;
  if (typeof result.url !== 'string' || typeof result.expiresAt !== 'string')
    throw Error('INVALID_PREVIEW');
  const url = new URL(result.url);
  const expires = new Date(result.expiresAt);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !Number.isFinite(expires.getTime()) ||
    expires.toISOString() !== result.expiresAt ||
    expires.getTime() <= Date.now()
  )
    throw Error('INVALID_PREVIEW');
  return { url: result.url, expiresAt: result.expiresAt };
}

function SelectedPreview({
  apiOrigin,
  autographId,
}: {
  apiOrigin: string;
  autographId: string;
}) {
  const { t } = useLocale();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const visible = useRef<Preview | null>(null);

  function load() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    visible.current = null;
    setPreview(null);
    setError(false);
    setLoading(true);
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(Error('PREVIEW_READ_ABORTED'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      try {
        // The deadline includes JSON reading, even if fetch/body ignores abort.
        const result = selectedPreview(
          await Promise.race([
            autographApi(apiOrigin).preview(autographId, controller.signal),
            aborted,
          ]),
        );
        if (request.current !== controller || controller.signal.aborted) return;
        visible.current = result;
        setPreview(result);
      } catch {
        if (request.current === controller) setError(true);
      } finally {
        window.clearTimeout(timer);
        controller.signal.removeEventListener('abort', rejectAbort);
        if (request.current === controller) {
          request.current = null;
          setLoading(false);
        }
      }
    })();
  }

  useEffect(() => {
    load();
    return () => {
      const previous = request.current;
      request.current = null;
      visible.current = null;
      previous?.abort();
    };
    // The keyed selection remounts on ID/origin change, before effects run.
  }, []);

  useEffect(() => {
    if (!preview) return;
    const remaining = Math.max(
      0,
      new Date(preview.expiresAt).getTime() - Date.now(),
    );
    const expiry = window.setTimeout(
      () => {
        if (visible.current !== preview) return;
        visible.current = null;
        setPreview(null);
        setError(true);
      },
      Math.min(remaining, 2_147_483_647),
    );
    const renewal =
      remaining > 5_000
        ? window.setTimeout(load, Math.min(remaining - 5_000, 2_147_483_647))
        : null;
    return () => {
      window.clearTimeout(expiry);
      if (renewal !== null) window.clearTimeout(renewal);
    };
  }, [preview]);

  return (
    <div className={styles.privatePreview} aria-busy={loading}>
      <p>{t('Your private preview')}</p>
      {preview && new Date(preview.expiresAt).getTime() > Date.now() ? (
        <img
          key={preview.url}
          src={preview.url}
          alt={t('Private preview of your selected digital autograph')}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          onError={() => {
            if (visible.current !== preview) return;
            visible.current = null;
            setPreview(null);
            setError(true);
          }}
        />
      ) : (
        <p role={error ? 'alert' : 'status'}>
          {t(
            error
              ? 'Preview unavailable. Refresh it to try again.'
              : 'Loading preview…',
          )}
        </p>
      )}
      <button type="button" aria-disabled={loading} onClick={load}>
        {t('Refresh private preview')}
      </button>
    </div>
  );
}
