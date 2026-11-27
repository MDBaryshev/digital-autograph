'use client';
import { useEffect, useRef, useState } from 'react';
import { withRequestDeadline } from '../lib/request-deadline';

export function TelegramConnection({ apiOrigin }: { apiOrigin: string }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const changing = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    operation.current = controller;
    changing.current = false;
    setLinked(null);
    setBusy(false);
    setError('');
    setAvailable(true);
    void withRequestDeadline(controller, async (signal) => {
      const response = await fetch(`${apiOrigin}/me/connections/telegram`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) throw Error();
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !('linked' in body) ||
        typeof body.linked !== 'boolean'
      )
        throw Error();
      return body.linked;
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value === null) setAvailable(false);
        else setLinked(value);
      })
      .catch(() => {
        if (operation.current === controller)
          setError('Не удалось проверить привязку.');
      });
    return () => {
      controller.abort();
      operation.current?.abort();
      operation.current = null;
    };
  }, [apiOrigin, revision]);
  async function change() {
    if (changing.current || linked === null) return;
    changing.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    try {
      const body: unknown = await withRequestDeadline(
        controller,
        async (signal) => {
          const response = await fetch(
            `${apiOrigin}/me/connections/telegram${linked ? '' : '/start'}`,
            {
              method: linked ? 'DELETE' : 'POST',
              credentials: 'include',
              cache: 'no-store',
              signal,
            },
          );
          if (!response.ok) throw Error();
          return linked ? null : response.json();
        },
      );
      if (controller.signal.aborted) return;
      if (linked) {
        setLinked(false);
        return;
      }
      if (
        !body ||
        typeof body !== 'object' ||
        !('authorizationUrl' in body) ||
        typeof body.authorizationUrl !== 'string'
      )
        throw Error();
      const url = new URL(body.authorizationUrl);
      if (
        url.origin !== 'https://oauth.telegram.org' ||
        url.username ||
        url.password
      )
        throw Error();
      window.location.assign(url.href);
    } catch {
      if (operation.current === controller)
        setError('Не удалось изменить привязку. Повторите действие.');
    } finally {
      if (operation.current === controller) {
        changing.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section aria-labelledby="telegram-connection-heading">
      <h2 id="telegram-connection-heading">Telegram</h2>
      <p>
        Необязательная связь с вашим аккаунтом. Вход и восстановление доступа
        через Telegram недоступны. Имя и фото Telegram не публикуются.
      </p>
      {!available ? (
        <p>Привязка пока не настроена.</p>
      ) : (
        <>
          {linked !== null && (
            <p role="status">
              {linked ? 'Telegram привязан.' : 'Telegram не привязан.'}
            </p>
          )}
          {linked !== null && (
            <button type="button" disabled={busy} onClick={() => void change()}>
              {busy
                ? 'Подождите…'
                : linked
                  ? 'Отвязать Telegram'
                  : 'Привязать Telegram'}
            </button>
          )}
          {error && (
            <>
              <p role="alert">{error}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                Повторить проверку
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
