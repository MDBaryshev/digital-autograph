'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { profileRejectionReasons } from '@digital-autograph/contracts';
import {
  moderationApi,
  ModerationApiError,
  reasonLabels,
  type ProfileReview,
  type RejectionReason,
} from '../lib/moderation-api';
import { withRequestDeadline } from '../lib/request-deadline';
import { useLocale } from './locale-provider';
import { ModerationWorkspace } from './moderation-workspace';
import styles from './moderation-workspace.module.css';

const submissionTitles = {
  profile: 'Public profile',
  appearance: 'Wall appearance',
  telegram: 'Telegram profile',
};
const assessmentLabels = {
  flagged: 'Automated check flagged this profile.',
  uncertain: 'Automated check needs a human decision.',
  unavailable: 'Automated check was unavailable.',
  quota: 'Automated check reached its daily limit.',
};

export function ModerationSections({ apiOrigin }: { apiOrigin: string }) {
  const { t } = useLocale();
  const [section, setSection] = useState('autographs');
  return (
    <>
      <nav className={styles.actions} aria-label={t('Moderation sections')}>
        <button
          type="button"
          aria-pressed={section === 'autographs'}
          onClick={() => setSection('autographs')}
        >
          {t('Autographs')}
        </button>
        <button
          type="button"
          aria-pressed={section === 'profiles'}
          onClick={() => setSection('profiles')}
        >
          {t('Profiles')}
        </button>
      </nav>
      {section === 'autographs' ? (
        <ModerationWorkspace apiOrigin={apiOrigin} />
      ) : (
        <ProfileModerationWorkspace apiOrigin={apiOrigin} />
      )}
    </>
  );
}

export function ProfileModerationWorkspace({
  apiOrigin,
}: {
  apiOrigin: string;
}) {
  const { t, locale } = useLocale();
  const api = useMemo(() => moderationApi(apiOrigin), [apiOrigin]);
  const [items, setItems] = useState<
    Pick<ProfileReview, 'id' | 'kind' | 'version' | 'createdAt'>[]
  >([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProfileReview | null>(null);
  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [loadedImages, setLoadedImages] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading submissions…');
  const [access, setAccess] = useState(false);
  const [revision, setRevision] = useState(0);
  const previewController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const recoveryRequired = useRef(true);
  const [error, setError] = useState(false);
  const handleError = (
    value: unknown,
    fallback = 'Review could not be confirmed. Refresh the queue before retrying.',
  ) => {
    setError(true);
    if (
      value instanceof ModerationApiError &&
      [401, 403].includes(value.status)
    ) {
      setAccess(false);
      setPreview(null);
      setMessage('Sign in with a platform moderator account.');
    } else if (
      value instanceof ModerationApiError &&
      value.code === 'SLUG_TAKEN'
    ) {
      setMessage(
        'This username is already taken. The owner can submit a different one.',
      );
    } else setMessage(fallback);
  };
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    recoveryRequired.current = true;
    setBusy(true);
    setAccess(false);
    setItems([]);
    setCursor(null);
    setPreview(null);
    setMessage('Loading submissions…');
    setError(false);
    void withRequestDeadline(controller, (signal) => api.profiles(null, signal))
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        recoveryRequired.current = false;
        setAccess(true);
        setMessage('');
      })
      .catch((value) => {
        if (active)
          handleError(
            value,
            'Could not load the moderation queue. Retry to read its current state.',
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
      const previousPreview = previewController.current;
      const previousAction = actionController.current;
      previewController.current = null;
      actionController.current = null;
      previousPreview?.abort();
      previousAction?.abort();
    };
  }, [api, revision]);
  const select = async (id: string) => {
    if (recoveryRequired.current || actionController.current) return;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreview(null);
    setLoadedImages([]);
    setReason('');
    setMessage('Loading submissions…');
    setError(false);
    try {
      const value = await withRequestDeadline(controller, (signal) =>
        api.profilePreview(id, signal),
      );
      if (previewController.current === controller) {
        setPreview(value);
        setMessage('');
      }
    } catch (value) {
      if (previewController.current === controller) handleError(value);
    } finally {
      if (previewController.current === controller)
        previewController.current = null;
    }
  };
  const decide = async (decision: 'approved' | 'rejected') => {
    if (
      !preview ||
      actionController.current ||
      recoveryRequired.current ||
      (decision === 'rejected' && !reason)
    )
      return;
    setBusy(true);
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const result = await withRequestDeadline(controller, (signal) =>
        api.decideProfile(
          preview.id,
          decision === 'approved'
            ? { decision }
            : { decision, reasonCode: reason as RejectionReason },
          signal,
        ),
      );
      if (actionController.current === controller) {
        if (result?.id !== preview.id || result.status !== decision)
          throw new Error('UNCONFIRMED_PROFILE_DECISION');
        setItems((rows) => rows.filter((row) => row.id !== preview.id));
        setPreview(null);
        setError(false);
        setMessage(
          decision === 'rejected'
            ? 'Changes returned to the owner for correction.'
            : preview.kind === 'telegram'
              ? 'Telegram profile review complete.'
              : 'Approved profile changes are now published.',
        );
      }
    } catch (value) {
      if (actionController.current === controller) {
        recoveryRequired.current = true;
        setAccess(false);
        setItems([]);
        setCursor(null);
        setPreview(null);
        handleError(value);
      }
    } finally {
      if (actionController.current === controller) {
        actionController.current = null;
        setBusy(false);
      }
    }
  };
  const imagesReady =
    !preview ||
    [preview.avatarDataUrl, preview.coverDataUrl].every(
      (url, index) => !url || loadedImages.includes(index),
    );
  return (
    <>
      {message && <p role={error ? 'alert' : 'status'}>{t(message)}</p>}
      <button
        type="button"
        className={styles.refresh}
        disabled={busy}
        onClick={() => setRevision((value) => value + 1)}
      >
        {t('Refresh queue')}
      </button>
      {access && (
        <div className={styles.layout}>
          <section className={styles.queue} aria-label={t('Pending profiles')}>
            <h2>{t('Pending profiles')}</h2>
            {!items.length && <p>{t('No submissions in this page.')}</p>}
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={preview?.id === item.id}
                    onClick={() => void select(item.id)}
                  >
                    {t(submissionTitles[item.kind])} ·{' '}
                    {new Date(item.createdAt).toLocaleString(
                      locale === 'ru' ? 'ru-RU' : 'en-GB',
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {cursor && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (recoveryRequired.current || actionController.current)
                    return;
                  setBusy(true);
                  const controller = new AbortController();
                  actionController.current = controller;
                  void withRequestDeadline(controller, (signal) =>
                    api.profiles(cursor, signal),
                  )
                    .then((page) => {
                      if (actionController.current === controller) {
                        setItems((rows) => [...rows, ...page.items]);
                        setCursor(page.nextCursor);
                      }
                    })
                    .catch((value) => {
                      if (actionController.current === controller)
                        handleError(value);
                    })
                    .finally(() => {
                      if (actionController.current === controller) {
                        actionController.current = null;
                        setBusy(false);
                      }
                    });
                }}
              >
                {t('Load more')}
              </button>
            )}
          </section>
          <section
            className={`${styles.review} ${styles.profileReview}`}
            aria-label={t('Review selected profile')}
          >
            {!preview ? (
              <p>{t('Select a profile submission to review.')}</p>
            ) : (
              <>
                <h2>{t(submissionTitles[preview.kind])}</h2>
                {preview.assessment && (
                  <p>
                    {t(assessmentLabels[preview.assessment])}
                    {preview.suggestedReason && (
                      <> {t(reasonLabels[preview.suggestedReason])}</>
                    )}
                  </p>
                )}
                <dl className={styles.profileFields}>
                  {preview.kind !== 'appearance' ? (
                    <>
                      <dt>{t('Display name')}</dt>
                      <dd>{preview.displayName || '—'}</dd>
                      <dt>{t('Username')}</dt>
                      <dd>{preview.slug || '—'}</dd>
                    </>
                  ) : (
                    <>
                      <dt>{t('Wall name')}</dt>
                      <dd>{preview.title || '—'}</dd>
                      <dt>{t('Wall description')}</dt>
                      <dd>{preview.description || '—'}</dd>
                    </>
                  )}
                </dl>
                {[preview.avatarDataUrl, preview.coverDataUrl].map(
                  (url, index) =>
                    url && (
                      <img
                        key={preview.id + index}
                        src={url}
                        alt={t(
                          index === 0 ? 'Avatar preview' : 'Cover preview',
                        )}
                        onLoad={() =>
                          setLoadedImages((values) => [...values, index])
                        }
                        onError={() => {
                          setLoadedImages((values) =>
                            values.filter((value) => value !== index),
                          );
                          setError(true);
                          setMessage(
                            'Preview could not be loaded. Refresh it.',
                          );
                        }}
                      />
                    ),
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    disabled={busy || !imagesReady}
                    onClick={() => void decide('approved')}
                  >
                    {t('Approve')}
                  </button>
                  <label>
                    {t('Rejection reason')}
                    <select
                      value={reason}
                      disabled={busy}
                      onChange={(event) =>
                        setReason(event.target.value as RejectionReason | '')
                      }
                    >
                      <option value="">{t('Choose a reason')}</option>
                      {profileRejectionReasons.map((value) => (
                        <option key={value} value={value}>
                          {t(reasonLabels[value])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !imagesReady || !reason}
                    onClick={() => void decide('rejected')}
                  >
                    {t('Return for correction')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
