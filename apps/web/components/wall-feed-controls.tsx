'use client';

import {
  creatorFollowResponse,
  wallDiscoveryResponse,
} from '@digital-autograph/contracts';
import { useEffect, useRef, useState } from 'react';
import { feedRequest, FeedRequestError } from '../lib/wall-feed-api';
import {
  FirstUseActionNotice,
  needsFirstUseConfirmation,
} from './first-use-action-notice';
import { useLocale } from './locale-provider';
import { SignInHelp, SignInOptions } from './sign-in-options';
import styles from './wall-feed.module.css';

function useSetting<T>(
  apiOrigin: string,
  path: string,
  schema: { parse: (value: unknown) => T },
) {
  const [value, setValue] = useState<T | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const write = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setValue(null);
    setFailure(null);
    setPending(false);
    feedRequest(apiOrigin, path, schema, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setValue(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(error);
      });
    return () => {
      controller.abort();
      write.current?.abort();
    };
  }, [apiOrigin, path, schema, attempt]);

  async function update(enabled: boolean) {
    if (write.current) return;
    const controller = new AbortController();
    write.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const next = await feedRequest(
        apiOrigin,
        path,
        schema,
        controller.signal,
        enabled ? 'PUT' : 'DELETE',
      );
      if (!controller.signal.aborted) setValue(next);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (!needsFirstUseConfirmation(error)) setValue(null);
        setFailure(error);
      }
    } finally {
      if (write.current === controller) write.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return {
    value,
    failure,
    pending,
    update,
    retry: () => setAttempt((n) => n + 1),
  };
}

export function CreatorFollowControl({
  apiOrigin,
  slug,
}: {
  apiOrigin: string;
  slug: string;
}) {
  const { t } = useLocale();
  const returnTo = `/creators/${encodeURIComponent(slug)}`;
  const setting = useSetting(
    apiOrigin,
    `${returnTo}/follow`,
    creatorFollowResponse,
  );
  const state = setting.value?.state;
  if (
    state === 'self' ||
    (setting.failure instanceof FeedRequestError &&
      setting.failure.status === 404)
  )
    return null;
  if (
    state === 'guest' ||
    (setting.failure instanceof FeedRequestError &&
      setting.failure.status === 401)
  ) {
    return (
      <details className={styles.control}>
        <summary>{t('Sign in to follow')}</summary>
        <SignInOptions apiOrigin={apiOrigin} returnTo={returnTo} />
        <SignInHelp />
      </details>
    );
  }
  return (
    <div className={styles.control}>
      {!state && !setting.failure && (
        <p role="status">{t('Checking follow…')}</p>
      )}
      {state === 'following' && (
        <p role="status">{t('Following this creator')}</p>
      )}
      {state && (
        <button
          className={styles.followButton}
          type="button"
          disabled={setting.pending}
          onClick={() => void setting.update(state !== 'following')}
        >
          {t(state === 'following' ? 'Unfollow creator' : 'Follow creator')}
        </button>
      )}
      {setting.failure != null &&
        (needsFirstUseConfirmation(setting.failure) ? (
          <FirstUseActionNotice returnTo={returnTo} />
        ) : (
          <div role="alert">
            <p>{t('Could not confirm your follow.')}</p>
            <button type="button" onClick={setting.retry}>
              {t('Check again')}
            </button>
          </div>
        ))}
    </div>
  );
}

function DiscoverySetting({
  apiOrigin,
  wallId,
}: {
  apiOrigin: string;
  wallId: string;
}) {
  const { t } = useLocale();
  const setting = useSetting(
    apiOrigin,
    `/me/walls/${wallId}/discovery`,
    wallDiscoveryResponse,
  );
  const discoverable = setting.value?.discoverable;
  return (
    <div className={styles.control}>
      <p>
        {t('Let people discover this public Wall in recommendations.')}{' '}
        {t('Followers can see this Wall even when recommendations are off.')}
      </p>
      {!setting.value && !setting.failure && (
        <p role="status">{t('Checking feed visibility…')}</p>
      )}
      {discoverable !== undefined && (
        <button
          type="button"
          disabled={setting.pending}
          onClick={() => void setting.update(!discoverable)}
        >
          {t(
            discoverable
              ? 'Remove from recommendations'
              : 'Show in recommendations',
          )}
        </button>
      )}
      {setting.failure != null &&
        (needsFirstUseConfirmation(setting.failure) ? (
          <FirstUseActionNotice returnTo="/me/walls" />
        ) : (
          <div role="alert">
            <p>{t('Could not confirm feed visibility.')}</p>
            <button type="button" onClick={setting.retry}>
              {t('Check again')}
            </button>
          </div>
        ))}
    </div>
  );
}

export function WallDiscoveryControl(props: {
  apiOrigin: string;
  wallId: string;
}) {
  const { t } = useLocale();
  const [opened, setOpened] = useState(false);
  return (
    <details
      className={styles.discovery}
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>{t('Feed visibility')}</summary>
      {opened && <DiscoverySetting {...props} />}
    </details>
  );
}
