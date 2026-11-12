'use client';

import { useEffect, useRef, useState } from 'react';
import type { WallAction, WallStatus } from '@digital-autograph/domain';
import { useLocale } from './locale-provider';
import { FirstUseActionNotice } from './first-use-action-notice';
import { workspaceRequest } from './workspace-api';
import styles from './workspace.module.css';

type Action = Exclude<WallAction, 'schedule'>;
// Presentation only. The authenticated backend checks the current locked state,
// ownership and date boundaries for every mutation.
const actions: Record<WallStatus, readonly Action[]> = {
  draft: ['publish'],
  scheduled: ['unschedule', 'publish'],
  live: ['pause', 'end'],
  paused: ['resume', 'end'],
  ended: ['archive'],
  archived: [],
};
const copy: Record<Action, { label: string; consequence: string }> = {
  publish: {
    label: 'Publish Wall',
    consequence:
      'Your Wall will be public and accept eligible new placements. Its start and end times must allow opening now.',
  },
  unschedule: {
    label: 'Return Wall to draft',
    consequence: 'Your Wall will become a private draft again.',
  },
  pause: {
    label: 'Pause Wall',
    consequence:
      'New placements will stop while the Wall is paused. Existing placements and history stay visible. Checkouts already in progress may need support.',
  },
  resume: {
    label: 'Resume Wall',
    consequence:
      'Your Wall will accept eligible new placements again if its start and end times allow it.',
  },
  end: {
    label: 'End Wall',
    consequence:
      'New placements will stop. Existing history stays visible. Ending cannot be undone, and checkouts already in progress may need support.',
  },
  archive: {
    label: 'Archive Wall',
    consequence:
      'Your Wall will be hidden from public pages. Archiving cannot be undone. This Wall still counts toward your account limit, so you cannot create another.',
  },
};

export function WallLifecycleControls({
  apiOrigin,
  wall,
  refresh,
}: {
  apiOrigin: string;
  wall: { id: string; status: WallStatus };
  refresh: (signal: AbortSignal) => Promise<void>;
}) {
  const { t } = useLocale();
  const [selection, setConfirmation] = useState<{
    action: Action;
    status: WallStatus;
    wallId: string;
  } | null>(null);
  const confirmation =
    selection?.status === wall.status && selection.wallId === wall.id
      ? selection.action
      : null;
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  useEffect(() => {
    setConfirmation((previous) =>
      previous &&
      (previous.wallId !== wall.id || previous.status !== wall.status)
        ? null
        : previous,
    );
  }, [wall.id, wall.status]);
  useEffect(() => {
    if (confirmation) cancel.current?.focus();
  }, [confirmation]);

  function closeConfirmation() {
    if (busy.current) return;
    setConfirmation(null);
    trigger.current?.focus();
  }

  async function perform(action?: Action) {
    if (
      busy.current ||
      (action && (needsRefresh || !actions[wall.status].includes(action)))
    )
      return;
    busy.current = true;
    setPending(true);
    setError('');
    setSaved(false);
    setConfirmation(null);
    // Lock actions until an authoritative workspace read succeeds, including
    // after a lost POST response. A retry here is always GET-only.
    setNeedsRefresh(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      if (action)
        await workspaceRequest(
          apiOrigin,
          `/walls/${encodeURIComponent(wall.id)}/transitions`,
          controller.signal,
          { action },
        );
      await refresh(controller.signal);
      if (!controller.signal.aborted) {
        setNeedsRefresh(false);
        setSaved(true);
        window.dispatchEvent(new Event('destka-workspace-updated'));
      }
    } catch (failure) {
      if (request.current === controller)
        setError(failure instanceof Error ? failure.message : 'REQUEST_FAILED');
    } finally {
      window.clearTimeout(timeout);
      busy.current = false;
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  const firstUse = [
    'FIRST_USE_REQUIRED',
    'LEGAL_DOCUMENT_CHANGED',
    'LEGAL_DOCUMENT_UNAVAILABLE',
  ].includes(error);
  const detail =
    error === 'INVALID_WALL_CONFIGURATION'
      ? 'This Wall cannot open with its current start and end times.'
      : error === 'INVALID_WALL_TRANSITION'
        ? 'The Wall status changed. Refresh its status before choosing another action.'
        : error === 'FORBIDDEN' || error === 'WALL_NOT_FOUND'
          ? 'You no longer have access to manage this Wall.'
          : 'The result could not be confirmed. Refresh the Wall status before choosing another action.';
  return (
    <section className={styles.wallControls} aria-label={t('Manage this Wall')}>
      {pending && <p role="status">{t('Updating Wall status…')}</p>}
      {saved && <p role="status">{t('Wall status refreshed.')}</p>}
      {firstUse ? (
        <FirstUseActionNotice returnTo="/me/walls" />
      ) : error === 'SIGN_IN' ? (
        <p role="alert">
          {t('Your session expired. Sign in again to manage your Wall.')}{' '}
          <a href="/me">{t('Sign in to continue')}</a>
        </p>
      ) : (
        error && <p role="alert">{t(detail)}</p>
      )}
      {needsRefresh && !pending && (
        <button type="button" onClick={() => void perform()}>
          {t('Refresh Wall status')}
        </button>
      )}
      <div className={styles.actions}>
        {actions[wall.status].map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending || needsRefresh}
            aria-expanded={confirmation === action}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setConfirmation({ action, wallId: wall.id, status: wall.status });
              setSaved(false);
            }}
          >
            {t(copy[action].label)}
          </button>
        ))}
      </div>
      {confirmation && !pending && !needsRefresh && (
        <fieldset
          className={styles.wallConfirmation}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeConfirmation();
            }
          }}
        >
          <legend>{t('Confirm Wall action')}</legend>
          <p>{t(copy[confirmation].consequence)}</p>
          <div className={styles.actions}>
            <button type="button" ref={cancel} onClick={closeConfirmation}>
              {t('Cancel')}
            </button>
            <button type="button" onClick={() => void perform(confirmation)}>
              {t('Confirm: {action}', { action: t(copy[confirmation].label) })}
            </button>
          </div>
        </fieldset>
      )}
      {wall.status === 'archived' && (
        <p>
          {t('This Wall is archived. Your account cannot create another Wall.')}
        </p>
      )}
    </section>
  );
}
