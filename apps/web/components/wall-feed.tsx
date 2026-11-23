'use client';

import {
  wallFeedResponse,
  type WallFeed,
  type WallFeedMode,
} from '@digital-autograph/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { feedRequest, FeedRequestError } from '../lib/wall-feed-api';
import { useLocale } from './locale-provider';
import { SignInHelp, SignInOptions } from './sign-in-options';
import { Icon } from './ui-icon';
import styles from './wall-feed.module.css';

const reasonLabels = {
  following: 'You follow this creator',
  signed: 'You signed this Wall',
  related: 'Related Walls',
  discovery: 'Discover',
} as const;

const statusLabels = {
  live: 'Live',
  scheduled: 'Scheduled',
  paused: 'Paused',
  ended: 'Ended',
} as const;

export function WallFeedScreen({
  apiOrigin,
  mode,
}: {
  apiOrigin: string;
  mode: WallFeedMode;
}) {
  const { t, locale } = useLocale();
  const [items, setItems] = useState<WallFeed['items'] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<
    'sign-in' | 'refresh' | 'retry' | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(
    (cursor: string | null) => {
      const controller = new AbortController();
      active.current = controller;
      setLoading(true);
      setFailure(null);
      const query = new URLSearchParams({ mode });
      if (cursor) query.set('cursor', cursor);
      void feedRequest(
        apiOrigin,
        `/wall-feed?${query}`,
        wallFeedResponse,
        controller.signal,
      )
        .then((page) => {
          if (controller.signal.aborted) return;
          setItems((previous) => {
            if (!cursor || !previous) return page.items;
            const seen = new Set(previous.map((item) => item.id));
            return [
              ...previous,
              ...page.items.filter((item) => !seen.has(item.id)),
            ];
          });
          setNextCursor(page.nextCursor);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure(
            error instanceof FeedRequestError && error.status === 401
              ? 'sign-in'
              : error instanceof FeedRequestError &&
                  error.code === 'INVALID_FEED_CURSOR'
                ? 'refresh'
                : 'retry',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
          if (active.current === controller) active.current = null;
        });
    },
    [apiOrigin, mode],
  );

  useEffect(() => {
    load(null);
    return () => active.current?.abort();
  }, [load, revision]);

  const refresh = () => {
    setNextCursor(null);
    setRevision((n) => n + 1);
  };
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (failure === 'sign-in') {
    return (
      <section className={styles.empty} aria-labelledby="feed-sign-in">
        <h2 id="feed-sign-in">{t('Sign in to see your follows')}</h2>
        <p>{t('Follow a creator to see updates to their Wall here.')}</p>
        <SignInOptions apiOrigin={apiOrigin} returnTo="/feed?view=following" />
        <SignInHelp />
      </section>
    );
  }

  return (
    <section aria-label={t('Walls in your feed')} aria-busy={loading}>
      {items === null && !failure && <p role="status">{t('Loading Walls…')}</p>}
      {items?.length === 0 && !failure && (
        <div className={styles.empty}>
          <h2>
            {t(
              mode === 'following'
                ? 'No Walls from your follows yet'
                : 'No Walls in your feed yet',
            )}
          </h2>
          <p>
            {t(
              mode === 'following'
                ? 'Follow a creator to see updates to their Wall here.'
                : 'Open a Wall from an invitation or follow a creator to start your feed.',
            )}
          </p>
          <a
            className="actionLink"
            href={mode === 'following' ? '/feed' : '/#open-invitation'}
          >
            {t(mode === 'following' ? 'Explore Walls' : 'Open an invitation')}
          </a>
        </div>
      )}
      {items !== null && (
        <div className={styles.feedActions}>
          <button type="button" disabled={loading} onClick={refresh}>
            <Icon name="history" size={17} /> {t('Refresh feed')}
          </button>
        </div>
      )}
      {!!items?.length && (
        <ul className={styles.wallList} role="list">
          {items.map((item) => (
            <li key={item.id} className={styles.wall}>
              <div className={styles.wallMeta}>
                <span>{t(reasonLabels[item.reason])}</span>
                <span className={styles.status}>
                  {t(statusLabels[item.status])}
                </span>
              </div>
              <h2>
                <a href={`/walls/${item.id}`}>
                  {item.title ||
                    t('{name}’s Wall', { name: item.creator.displayName })}
                </a>
              </h2>
              <a
                className={styles.creator}
                href={`/creators/${encodeURIComponent(item.creator.slug)}`}
              >
                {item.creator.displayName}
              </a>
              <p className={styles.activity}>
                {t('{count} of {total} places taken', {
                  count: item.occupiedCount,
                  total: item.slotCount,
                })}
              </p>
              <div className={styles.occupancy} aria-hidden="true">
                {Array.from({ length: item.slotCount }, (_, i) => (
                  <span
                    key={i}
                    data-occupied={i < item.occupiedCount ? true : undefined}
                  />
                ))}
              </div>
              <p className={styles.activity}>
                {t(
                  item.activityKind === 'placement'
                    ? 'Placement activity'
                    : 'Wall updated',
                )}{' '}
                ·{' '}
                <time dateTime={item.activityAt}>
                  {date.format(new Date(item.activityAt))}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
      {failure && (
        <div className={styles.empty} role="alert">
          <p>
            {t(
              failure === 'refresh'
                ? 'This feed page has expired. Refresh the feed to continue.'
                : 'Could not load Walls. Check your connection and try again.',
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              if (failure === 'refresh' || !nextCursor) refresh();
              else if (!active.current) load(nextCursor);
            }}
          >
            {t(failure === 'refresh' ? 'Refresh feed' : 'Try again')}
          </button>
        </div>
      )}
      {nextCursor && !failure && (
        <button
          className={styles.more}
          type="button"
          disabled={loading}
          onClick={() => {
            if (!active.current) load(nextCursor);
          }}
        >
          {t(loading ? 'Loading Walls…' : 'Load more Walls')}
        </button>
      )}
    </section>
  );
}
