'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import {
  ownerSharesApi,
  OwnerSharesApiError,
  type OwnerShare,
} from '../lib/owner-shares-api';
import styles from './notification-panel.module.css';

export function OwnerShareLinks({ apiOrigin }: { apiOrigin: string }) {
  return <ShareLinks key={apiOrigin} apiOrigin={apiOrigin} />;
}

function ShareLinks({ apiOrigin }: { apiOrigin: string }) {
  const { t, locale } = useLocale();
  const api = useRef(ownerSharesApi(apiOrigin));
  const [items, setItems] = useState<OwnerShare[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState<'read' | 'more' | 'revoke' | null>(
    null,
  );
  const operation = useRef<AbortController | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const restoreAfterMutation = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [access, setAccess] = useState<number | null>(null);
  const busy = working !== null;
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (revokeTrigger.current?.isConnected) revokeTrigger.current.focus();
  }, [confirming]);
  useEffect(() => {
    if (working === 'revoke' || !restoreAfterMutation.current) return;
    restoreAfterMutation.current = false;
    if (
      document.activeElement === document.body ||
      document.activeElement === confirmButton.current
    )
      refreshButton.current?.focus();
  }, [working]);

  const failed = (e: unknown, message: string) => {
    setItems([]);
    setCursor(null);
    setReady(false);
    setConfirming(null);
    setNotice('');
    const status = e instanceof OwnerSharesApiError ? e.status : null;
    setAccess(status);
    setError(
      status === 401
        ? 'Sign in to manage your public links.'
        : status === 403
          ? 'Your public links are no longer available to this account.'
          : message,
    );
  };

  async function load(more = false, afterReadNotice = '') {
    if (operation.current || (more && !cursor)) return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking(more ? 'more' : 'read');
    setConfirming(null);
    setError('');
    setNotice('');
    setAccess(null);
    if (!more) {
      setItems([]);
      setCursor(null);
      setReady(false);
    }
    try {
      const page = await api.current.list(
        more ? cursor : null,
        controller.signal,
      );
      if (operation.current !== controller) return;
      setItems((previous) =>
        more ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
      setReady(true);
      setNotice(afterReadNotice);
    } catch (e) {
      if (operation.current === controller)
        failed(e, 'Could not load your public links. Refresh to try again.');
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
    // Origin changes remount the component and discard private account state.
  }, []);

  async function revoke(id: string) {
    if (
      operation.current ||
      confirming !== id ||
      !items.some((item) => item.id === id && item.revokedAt === null)
    )
      return;
    const controller = new AbortController();
    operation.current = controller;
    restoreAfterMutation.current =
      document.activeElement === confirmButton.current;
    setWorking('revoke');
    setError('');
    setNotice('');
    try {
      await api.current.revoke(id, controller.signal);
      if (operation.current !== controller) return;
      operation.current = null;
      void load(false, 'Public link revoked.');
    } catch (e) {
      if (operation.current === controller)
        failed(
          e,
          'Revocation could not be confirmed. Refresh links before trying again.',
        );
    } finally {
      controller.abort();
      if (operation.current === controller) {
        operation.current = null;
        setWorking(null);
      }
    }
  }

  const date = (value: string) =>
    new Date(value).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB');
  return (
    <main className={styles.panel}>
      <h1>{t('My public links')}</h1>
      <p>
        {t(
          'Manage the share cards you created on Walls, including links created before this visit.',
        )}
      </p>
      <p>
        {t(
          'Revoking a link stops it opening in Destka. Copies already saved by social networks may remain.',
        )}
      </p>
      <button
        ref={refreshButton}
        type="button"
        disabled={working === 'revoke'}
        aria-disabled={busy}
        onClick={() => void load()}
      >
        {t('Refresh links')}
      </button>
      {error && <p role="alert">{t(error)}</p>}
      {access === 401 && <a href="/me">{t('Sign in to continue')}</a>}
      {notice && <p role="status">{t(notice)}</p>}
      {working === 'read' && <p role="status">{t('Loading public links…')}</p>}
      {ready && items.length === 0 && (
        <p>
          {t(
            'No public links yet. Create a share card on a Wall to find it here.',
          )}
        </p>
      )}
      <ul aria-busy={busy}>
        {items.map((item) => (
          <li key={item.id}>
            <h2>
              {item.event === 'final_wall'
                ? t('Final Wall')
                : t('Slot ') + item.slotNumber}
            </h2>
            <p>
              <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
            </p>
            {item.publicAlias && (
              <p>
                {t('Public username (optional)')}: {item.publicAlias}
              </p>
            )}
            <p>
              <a href={`/walls/${item.wallId}`}>{t('Open Wall')}</a>
            </p>
            {item.revokedAt ? (
              <p>
                {t('Revoked')}:{' '}
                <time dateTime={item.revokedAt}>{date(item.revokedAt)}</time>
              </p>
            ) : (
              <>
                <p>{t('Not revoked')}</p>
                <p>
                  <a href={`/s/${item.id}`}>{t('Open share card')}</a>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    revokeTrigger.current = event.currentTarget;
                    setConfirming(item.id);
                  }}
                >
                  {t('Revoke public link')}
                </button>
                {confirming === item.id && (
                  <div role="group" aria-label={t('Confirm link revocation')}>
                    <p>{t('Revoke this public link?')}</p>
                    <button
                      ref={confirmButton}
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(item.id)}
                    >
                      {t('Confirm revocation')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      {t('Cancel revocation')}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void load(true)}>
          {t('Load more links')}
        </button>
      )}
    </main>
  );
}
