'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminLookupQuery,
  type AdminLookupResponse,
} from '@digital-autograph/contracts';
import { AdminLookupApiError, readAdminLookup } from '../lib/admin-lookup-api';
import { AccountSession } from './account-session';
import { useLocale } from './locale-provider';
import styles from './workspace.module.css';
import lookupStyles from './admin-lookup.module.css';

const kindNames = {
  user: 'User',
  creator: 'Creator',
  wall: 'Wall',
  autograph: 'Autograph',
  order: 'Order',
  payment: 'Payment',
};

export function AdminLookup({ apiOrigin }: { apiOrigin: string }) {
  return <AdminLookupScreen key={apiOrigin} apiOrigin={apiOrigin} />;
}

function AdminLookupScreen({ apiOrigin }: { apiOrigin: string }) {
  const { t, locale } = useLocale();
  const [access, setAccess] = useState<
    'checking' | 'allowed' | 'anonymous' | 'forbidden' | 'error'
  >('checking');
  const [revision, setRevision] = useState(0);
  const [id, setId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AdminLookupResponse | null>(null);
  const request = useRef<AbortController | null>(null);

  function clearRequest() {
    const previous = request.current;
    request.current = null;
    previous?.abort();
  }

  useEffect(() => {
    const invalidate = () => {
      clearRequest();
      setResult(null);
      setId('');
      setPending(false);
      setError('');
      setAccess('checking');
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    window.addEventListener('focus', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    return () => {
      window.removeEventListener('focus', invalidate);
      document.removeEventListener('visibilitychange', invalidate);
      clearRequest();
    };
  }, []);

  useEffect(() => {
    clearRequest();
    const controller = new AbortController();
    request.current = controller;
    setAccess('checking');
    setResult(null);
    setError('');
    void readAdminLookup(apiOrigin, undefined, controller.signal)
      .then(() => {
        if (request.current === controller) setAccess('allowed');
      })
      .catch((cause) => {
        if (request.current !== controller) return;
        setAccess(
          cause instanceof AdminLookupApiError && cause.status === 401
            ? 'anonymous'
            : cause instanceof AdminLookupApiError && cause.status === 403
              ? 'forbidden'
              : 'error',
        );
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
      });
    return () => {
      clearRequest();
    };
  }, [apiOrigin, revision]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (access !== 'allowed' || pending) return;
    clearRequest();
    setResult(null);
    const query = adminLookupQuery.safeParse({ id: id.trim() });
    if (!query.success || !query.data.id) {
      setError('Enter a valid internal record ID.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      const response = await readAdminLookup(
        apiOrigin,
        query.data.id,
        controller.signal,
      );
      if (request.current === controller) setResult(response);
    } catch (cause) {
      if (request.current !== controller) return;
      if (
        cause instanceof AdminLookupApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        setAccess(cause.status === 401 ? 'anonymous' : 'forbidden');
        setId('');
      } else setError('The record could not be loaded. Try the search again.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  if (access === 'checking')
    return <p role="status">{t('Checking administrator access…')}</p>;
  if (access === 'anonymous')
    return <AccountSession apiOrigin={apiOrigin} returnTo="/admin" />;
  if (access === 'forbidden')
    return <p role="alert">{t('Administrator access is required.')}</p>;
  if (access === 'error')
    return (
      <div>
        <p role="alert">{t('Administrator access could not be checked.')}</p>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          {t('Try again')}
        </button>
      </div>
    );

  return (
    <section aria-label={t('Record lookup')}>
      <p>{t('Find a record by its internal ID.')}</p>
      <form className={styles.form} onSubmit={(event) => void search(event)}>
        <label>
          {t('Record ID')}
          <input
            value={id}
            maxLength={36}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              clearRequest();
              setId(event.target.value);
              setPending(false);
              setResult(null);
              setError('');
            }}
          />
        </label>
        <button type="submit" disabled={pending}>
          {t(pending ? 'Searching…' : 'Search records')}
        </button>
      </form>
      {error && <p role="alert">{t(error)}</p>}
      {result &&
        (result.items.length === 0 ? (
          <p role="status">{t('No record found for this ID.')}</p>
        ) : (
          <ul className={lookupStyles.results} aria-label={t('Search results')}>
            {result.items.map((item) => (
              <li key={`${item.kind}:${item.id}`} className={styles.card}>
                <h2>{t(kindNames[item.kind])}</h2>
                <dl>
                  <dt>{t('Record ID')}</dt>
                  <dd>
                    <code>{item.id}</code>
                  </dd>
                  <dt>{t('Status')}</dt>
                  <dd>{item.state ? t(item.state) : t('Not recorded')}</dd>
                  <dt>{t('Created')}</dt>
                  <dd>
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString(locale, {
                        timeZone: 'UTC',
                      })}{' '}
                      UTC
                    </time>
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
