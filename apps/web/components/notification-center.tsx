'use client';
import { useLocale } from './locale-provider';

import { useEffect, useRef, useState } from 'react';
import { notificationKinds } from '@digital-autograph/domain';
import styles from './notification-panel.module.css';
import {
  notificationRequest as request,
  NotificationApiError,
} from '../lib/notification-api';
type Pref = {
  web: boolean;
  telegram: boolean;
  mutedKinds: string[];
  telegramLinked: boolean;
  telegramAvailable: boolean;
};
type Item = {
  id: string;
  title: string;
  detail: string | null;
  deepLink: string;
  readAt: string | null;
};
export function NotificationCenter({ apiOrigin }: { apiOrigin: string }) {
  return <NotificationInbox key={apiOrigin} apiOrigin={apiOrigin} />;
}

function NotificationInbox({ apiOrigin }: { apiOrigin: string }) {
  const { t } = useLocale();

  const [preferences, setPreferences] = useState<Pref | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState<'read' | 'mutation' | null>(null);
  const operation = useRef<AbortController | null>(null);
  const busy = working !== null;
  const clearPrivate = () => {
    setPreferences(null);
    setItems([]);
  };
  const failed = (error: unknown, fallback: string) => {
    clearPrivate();
    setError(
      error instanceof NotificationApiError && [401, 403].includes(error.status)
        ? error.message
        : fallback,
    );
  };
  async function load() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking('read');
    clearPrivate();
    setError('');
    try {
      const [p, i] = await Promise.all([
        request<Pref>(
          apiOrigin,
          '/me/notifications/preferences',
          'GET',
          undefined,
          controller.signal,
        ),
        request<Item[]>(
          apiOrigin,
          '/me/notifications',
          'GET',
          undefined,
          controller.signal,
        ),
      ]);
      if (operation.current === controller) {
        setPreferences(p);
        setItems(i);
      }
    } catch (e) {
      if (operation.current === controller)
        failed(e, 'Could not load notifications. Refresh to try again.');
    } finally {
      controller.abort();
      if (operation.current === controller) {
        operation.current = null;
        setWorking(null);
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      const controller = operation.current;
      operation.current = null;
      controller?.abort();
    };
    // Changing origin remounts this keyed inbox and discards all private state.
  }, []);
  async function act<T>(
    work: (signal: AbortSignal) => Promise<T>,
    complete?: (value: T) => void,
  ) {
    if (operation.current || !preferences) return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking('mutation');
    setError('');
    try {
      const value = await work(controller.signal);
      if (operation.current !== controller) return;
      if (complete) complete(value);
      else {
        operation.current = null;
        void load();
      }
    } catch (e) {
      if (operation.current === controller)
        failed(
          e,
          'Changes could not be confirmed. Refresh notifications before trying again.',
        );
    } finally {
      controller.abort();
      if (operation.current === controller) {
        operation.current = null;
        setWorking(null);
      }
    }
  }
  return (
    <main className={styles.panel}>
      <h1>{t('Notifications')}</h1>
      {error && <p role="alert">{t(error)}</p>}
      <button
        type="button"
        disabled={working === 'mutation'}
        aria-disabled={busy}
        onClick={() => void load()}
      >
        {t('Refresh notifications')}
      </button>
      {working === 'read' && <p role="status">{t('Loading…')}</p>}
      {preferences && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act((signal) =>
                request(
                  apiOrigin,
                  '/me/notifications/preferences',
                  'PUT',
                  {
                    web: preferences.web,
                    telegram: preferences.telegram,
                    mutedKinds: preferences.mutedKinds,
                  },
                  signal,
                ),
              );
            }}
          >
            <fieldset disabled={busy}>
              <legend>{t('Preferences')}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.web}
                  onChange={(e) =>
                    setPreferences({ ...preferences, web: e.target.checked })
                  }
                />{' '}
                {t('In-app notifications')}
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={!preferences.telegramLinked}
                  checked={preferences.telegram}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      telegram: e.target.checked,
                    })
                  }
                />{' '}
                {t('Telegram notifications')}
              </label>
              {notificationKinds.map((kind) => (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={!preferences.mutedKinds.includes(kind)}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        mutedKinds: e.target.checked
                          ? preferences.mutedKinds.filter((k) => k !== kind)
                          : [...preferences.mutedKinds, kind],
                      })
                    }
                  />{' '}
                  {t(kind.replaceAll('_', ' '))}
                </label>
              ))}
              <button type="submit">{t('Save preferences')}</button>
            </fieldset>
          </form>
          {preferences.telegramAvailable && !preferences.telegramLinked && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  (signal) =>
                    request<{ url: string }>(
                      apiOrigin,
                      '/me/notifications/telegram/link',
                      'POST',
                      undefined,
                      signal,
                    ),
                  (link) => window.location.assign(link.url),
                )
              }
            >
              {t('Connect Telegram and consent to notifications')}
            </button>
          )}
          {preferences.telegramLinked && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act((signal) =>
                  request(
                    apiOrigin,
                    '/me/notifications/telegram',
                    'DELETE',
                    undefined,
                    signal,
                  ),
                )
              }
            >
              {t('Disconnect Telegram')}
            </button>
          )}
          <p>
            {t(
              'You can turn off all channels or individual events. Telegram also accepts /stop. Ordinary notices of the same type are limited to one per Wall in 10 minutes. Financial notices are not combined by that short window. All channels remain limited to 20 notices per hour.',
            )}
          </p>
          <h2>{t('Inbox')}</h2>
          {items.length === 0 ? (
            <p>{t('No notifications.')}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <a href={item.deepLink}>{t(item.title)}</a>
                  {item.detail && <p>{t(item.detail)}</p>}
                  {!item.readAt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act((signal) =>
                          request(
                            apiOrigin,
                            `/me/notifications/${item.id}/read`,
                            'POST',
                            undefined,
                            signal,
                          ),
                        )
                      }
                    >
                      {t('Mark read')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
