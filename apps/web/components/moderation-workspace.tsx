'use client';
import { useLocale } from './locale-provider';

import { YandexSignIn } from './yandex-sign-in';
import { VkIdSignIn } from './vk-id-sign-in';
import { EmailSignIn } from './email-sign-in';

import { useEffect, useRef, useState } from 'react';
import {
  ModerationApiError,
  moderationApi,
  reasonLabels,
  rejectionReasons,
  type QueueItem,
  type PrivatePreview,
  type RejectionReason,
  type QueuePage,
} from '../lib/moderation-api';
import styles from './moderation-workspace.module.css';

export function ModerationWorkspace({ apiOrigin }: { apiOrigin: string }) {
  return <ModerationQueue key={apiOrigin} apiOrigin={apiOrigin} />;
}

type Operation = {
  kind: 'queue' | 'more' | 'decision';
  controller: AbortController;
};

async function bounded<T>(
  controller: AbortController,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error('MODERATION_REQUEST_ABORTED'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    return await Promise.race([work(controller.signal), aborted]);
  } finally {
    window.clearTimeout(timer);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

function validatePage(page: QueuePage): QueuePage {
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    !(page.nextCursor === null || typeof page.nextCursor === 'string') ||
    page.items.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        !['canvas', 'photo'].includes(item.source) ||
        !Number.isFinite(Date.parse(item.approvedAt)) ||
        !Number.isFinite(Date.parse(item.createdAt)),
    )
  )
    throw Error('INVALID_QUEUE');
  return page;
}

function ModerationQueue({ apiOrigin }: { apiOrigin: string }) {
  const { t, locale } = useLocale();

  const api = useRef(moderationApi(apiOrigin));
  const [access, setAccess] = useState<
    'loading' | 'allowed' | 'signin' | 'forbidden' | 'error'
  >('loading');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrivatePreview | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [working, setWorking] = useState<Operation['kind'] | null>(null);
  const busy = working !== null;
  const [message, setMessage] = useState<string | null>(null);
  const operation = useRef<Operation | null>(null);
  const recoveryRequired = useRef(false);
  const previewController = useRef<AbortController | null>(null);

  const clearReview = () => {
    const previous = previewController.current;
    previewController.current = null;
    previous?.abort();
    setSelected(null);
    setPreview(null);
    setPreviewLoaded(false);
    setPreviewError(null);
    setReason('');
  };

  const unavailable = (error: unknown, fallback: string) => {
    clearReview();
    setItems([]);
    setCursor(null);
    recoveryRequired.current = true;
    if (error instanceof ModerationApiError && error.status === 401) {
      setMessage(null);
      setAccess('signin');
    } else if (error instanceof ModerationApiError && error.status === 403) {
      setMessage(null);
      setAccess('forbidden');
    } else {
      setMessage(fallback);
      setAccess('error');
    }
  };

  const loadQueue = async (more = false) => {
    if (operation.current?.kind === 'decision') return;
    if (more && (operation.current || !cursor || recoveryRequired.current))
      return;
    if (!more && operation.current?.kind === 'queue') return;
    const previous = operation.current;
    const next: Operation = {
      kind: more ? 'more' : 'queue',
      controller: new AbortController(),
    };
    operation.current = next;
    previous?.controller.abort();
    setWorking(next.kind);
    setMessage(null);
    if (!more) {
      clearReview();
      setItems([]);
      setCursor(null);
      if (access !== 'allowed') setAccess('loading');
    }
    try {
      const page = validatePage(
        await bounded(next.controller, (signal) =>
          api.current.queue(20, more ? cursor : null, signal),
        ),
      );
      if (operation.current !== next) return;
      setItems((current) => (more ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      recoveryRequired.current = false;
      setAccess('allowed');
    } catch (error) {
      if (operation.current === next)
        unavailable(
          error,
          'Could not load the moderation queue. Retry to read its current state.',
        );
    } finally {
      if (operation.current === next) {
        operation.current = null;
        setWorking(null);
      }
    }
  };

  useEffect(() => {
    void loadQueue();
    return () => {
      const previous = operation.current;
      operation.current = null;
      previous?.controller.abort();
      const previewRequest = previewController.current;
      previewController.current = null;
      previewRequest?.abort();
    };
    // A changed API origin mounts a new keyed queue, discarding private state.
  }, []);

  useEffect(() => {
    if (!preview) return;
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, new Date(preview.expiresAt).getTime() - Date.now()),
    );
    const timer = window.setTimeout(() => {
      setPreviewLoaded(false);
      setPreviewError(
        'The private preview expired. Refresh it before deciding.',
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [preview]);

  const loadPreview = async (id: string) => {
    if (operation.current || recoveryRequired.current) return;
    previewController.current?.abort();
    const next = new AbortController();
    previewController.current = next;
    setSelected(id);
    setPreview(null);
    setPreviewLoaded(false);
    setPreviewError(null);
    setReason('');
    try {
      const value = await bounded(next, (signal) =>
        api.current.preview(id, signal),
      );
      if (previewController.current === next) {
        if (
          !value ||
          typeof value.url !== 'string' ||
          !Number.isFinite(Date.parse(value.expiresAt))
        )
          throw Error('INVALID_PREVIEW');
        setPreview(value);
      }
    } catch (error) {
      if (previewController.current === next) {
        if (
          error instanceof ModerationApiError &&
          [401, 403].includes(error.status)
        )
          unavailable(error, 'Private preview unavailable. Retry.');
        else setPreviewError('Private preview unavailable. Retry.');
      }
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (
      !selected ||
      !previewLoaded ||
      !preview ||
      Date.now() >= new Date(preview.expiresAt).getTime() ||
      operation.current ||
      recoveryRequired.current ||
      (decision === 'rejected' && !reason)
    )
      return;
    const next: Operation = {
      kind: 'decision',
      controller: new AbortController(),
    };
    operation.current = next;
    setWorking('decision');
    setMessage(null);
    try {
      await bounded(next.controller, (signal) =>
        api.current.decide(
          selected,
          decision === 'approved'
            ? { decision }
            : { decision, reasonCode: reason as RejectionReason },
          signal,
        ),
      );
      if (operation.current !== next) return;
      setItems((current) => current.filter((item) => item.id !== selected));
      clearReview();
      setMessage(
        decision === 'approved'
          ? 'Approved. The autograph is ready but remains private.'
          : 'Rejected. The owner can see the reason code.',
      );
    } catch (error) {
      if (operation.current === next) {
        unavailable(
          error,
          error instanceof ModerationApiError &&
            error.code === 'MODERATION_ALREADY_DECIDED'
            ? 'Another moderator already made a different decision. Refresh the queue.'
            : 'Decision could not be confirmed. Refresh the queue before deciding again.',
        );
      }
    } finally {
      if (operation.current === next) {
        operation.current = null;
        setWorking(null);
      }
    }
  };

  if (access === 'loading')
    return <p role="status">{t('Checking moderation access…')}</p>;
  if (access === 'forbidden')
    return (
      <p role="alert">
        {t('Forbidden: a platform moderator or admin role is required.')}
      </p>
    );
  if (access === 'error')
    return (
      <section>
        <p role="alert">
          {t(
            message ??
              'Could not load the moderation queue. Retry to read its current state.',
          )}
        </p>
        <button type="button" onClick={() => void loadQueue()}>
          {t('Retry queue')}
        </button>
      </section>
    );
  if (access === 'signin') {
    const returnTo = encodeURIComponent('/moderation');
    return (
      <section>
        <p>{t('Sign in with a platform moderator account.')}</p>
        <a href={`${apiOrigin}/auth/google/start?returnTo=${returnTo}`}>
          {t('Sign in with Google')}
        </a>
        {' · '}
        <a href={`${apiOrigin}/auth/telegram/start?returnTo=${returnTo}`}>
          {t('Sign in with Telegram')}
        </a>
        <YandexSignIn apiOrigin={apiOrigin} returnTo="/moderation" />
        <VkIdSignIn apiOrigin={apiOrigin} returnTo="/moderation" />
        <EmailSignIn apiOrigin={apiOrigin} returnTo="/moderation" />
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <section
        className={styles.queue}
        aria-label={t('Pending autographs')}
        aria-busy={working === 'queue' || working === 'more'}
      >
        <h2>{t('Pending')}</h2>
        <button
          type="button"
          disabled={working === 'decision'}
          aria-disabled={working === 'decision' || working === 'queue'}
          onClick={() => void loadQueue()}
        >
          {working === 'queue' ? t('Refreshing queue…') : t('Refresh queue')}
        </button>
        {working === 'queue' ? (
          <p role="status">{t('Refreshing queue…')}</p>
        ) : (
          items.length === 0 && <p>{t('No submissions in this page.')}</p>
        )}
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadPreview(item.id)}
              >
                {t(item.source)} ·{' '}
                {new Date(item.approvedAt).toLocaleString(
                  locale === 'ru' ? 'ru-RU' : 'en-US',
                )}
              </button>
            </li>
          ))}
        </ul>
        {cursor && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadQueue(true)}
          >
            {t('Load more')}
          </button>
        )}
      </section>
      <section
        className={styles.review}
        aria-label={t('Review selected autograph')}
      >
        {message && <p role="status">{t(message)}</p>}
        {!selected && <p>{t('Select a pending autograph to review.')}</p>}
        {selected && (
          <>
            <h2>{t('Cleaned autograph')}</h2>
            <p>
              {t(
                'Review this owner-approved image for content suitability only. This is not identity or signature verification.',
              )}
            </p>
            {preview && (
              <img
                key={preview.url}
                src={preview.url}
                alt={t('Private cleaned autograph for moderation')}
                referrerPolicy="no-referrer"
                onLoad={() => {
                  if (Date.now() < new Date(preview.expiresAt).getTime())
                    setPreviewLoaded(true);
                }}
                onError={() => {
                  setPreviewLoaded(false);
                  setPreviewError('Preview could not be loaded. Refresh it.');
                }}
              />
            )}
            {previewError && (
              <p className={styles.error} role="alert">
                {t(previewError)}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadPreview(selected)}
              >
                {t('Refresh private preview')}
              </button>
              <button
                type="button"
                disabled={busy || !previewLoaded}
                onClick={() => void decide('approved')}
              >
                {t('Approve')}
              </button>
              <label>
                {t('Rejection reason')}{' '}
                <select
                  aria-label={t('Rejection reason')}
                  disabled={busy}
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value as RejectionReason | '')
                  }
                >
                  <option value="">{t('Choose a reason')}</option>
                  {rejectionReasons.map((code) => (
                    <option key={code} value={code}>
                      {t(reasonLabels[code])}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !previewLoaded || !reason}
                onClick={() => void decide('rejected')}
              >
                {t('Reject')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
