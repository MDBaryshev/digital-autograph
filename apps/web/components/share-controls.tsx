'use client';
import { useLocale } from './locale-provider';

import { useEffect, useRef, useState } from 'react';
import { notificationRequest as request } from '../lib/notification-api';
import styles from './notification-panel.module.css';
type ShareControlsProps = {
  apiOrigin: string;
  wallId: string;
  slots: Array<{ id: string; position: number }>;
};

export function ShareControls(props: ShareControlsProps) {
  return (
    <ScopedShareControls
      key={JSON.stringify([props.apiOrigin, props.wallId])}
      {...props}
    />
  );
}

function ScopedShareControls({ apiOrigin, wallId, slots }: ShareControlsProps) {
  const { t } = useLocale();

  const [slotId, setSlotId] = useState('');
  const [shareId, setShareId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef<AbortController | null>(null);
  const isCurrent = (controller: AbortController) =>
    operation.current === controller && !controller.signal.aborted;
  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [],
  );
  async function action(fn: (controller: AbortController) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn(controller);
    } catch (e) {
      if (isCurrent(controller))
        setError(
          e instanceof Error ? e.message : 'Request failed. Please retry.',
        );
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
      controller.abort();
    }
  }
  const url =
    shareId && typeof window !== 'undefined'
      ? `${window.location.origin}/s/${shareId}`
      : '';
  return (
    <section
      className={styles.panel}
      aria-label={t('Sharing and Wall notifications')}
    >
      <h2>{t('Share your place')}</h2>
      <p>
        {t(
          'Create a card for your own placement. After the Wall ends, leave the slot blank to share the final Wall. Sign in first.',
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async (controller) => {
            const result = await request<{ id: string }>(
              apiOrigin,
              '/me/shares',
              'POST',
              {
                wallId,
                ...(slotId ? { slotId } : {}),
              },
              controller.signal,
            );
            if (!isCurrent(controller)) return;
            setShareId(result.id);
            setCopied(false);
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>{t('Public card')}</legend>
          <label>
            {t('Your slot')}
            <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              <option value="">{t('Final Wall')}</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {t('Slot ')}
                  {slot.position + 1}
                </option>
              ))}
            </select>
          </label>
          <p>
            {t(
              'Share cards show the Wall author and slot or final Wall. Participant usernames are currently unavailable.',
            )}
          </p>
          <button type="submit">{t('Create share card')}</button>
        </fieldset>
      </form>
      {shareId && (
        <div>
          <p>
            <a href={`/s/${shareId}`}>{t('Open share card')}</a>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async (controller) => {
                void request(
                  apiOrigin,
                  `/public/shares/${shareId}/interactions`,
                  'POST',
                  { kind: 'share_clicked', dedupeKey: crypto.randomUUID() },
                  controller.signal,
                ).catch(() => {});
                if (navigator.share) {
                  try {
                    await navigator.share({ title: 'Destka', url });
                    return;
                  } catch (e) {
                    if (e instanceof Error && e.name === 'AbortError') return;
                  }
                }
                if (!isCurrent(controller)) return;
                try {
                  await navigator.clipboard.writeText(url);
                  if (isCurrent(controller)) setCopied(true);
                } catch {
                  if (isCurrent(controller)) setError(`Copy this link: ${url}`);
                }
              })
            }
          >
            {t('Share or copy link')}
          </button>
          {copied && <p role="status">{t('Link copied.')}</p>}
          <p>
            <a href={url}>{url}</a>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async (controller) => {
                await request(
                  apiOrigin,
                  `/me/shares/${shareId}`,
                  'DELETE',
                  undefined,
                  controller.signal,
                );
                if (isCurrent(controller)) setShareId('');
              })
            }
          >
            {t('Revoke public link')}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void action(async (controller) => {
            await request(
              apiOrigin,
              `/me/notifications/walls/${wallId}`,
              'PUT',
              { enabled: true },
              controller.signal,
            );
            if (!isCurrent(controller)) return;
            setNotice(
              'Wall reminders enabled. Manage channels in Notifications.',
            );
          })
        }
      >
        {t('Notify me before this Wall starts or ends')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void action(async (controller) => {
            await request(
              apiOrigin,
              `/me/notifications/walls/${wallId}`,
              'PUT',
              { enabled: false },
              controller.signal,
            );
            if (isCurrent(controller))
              setNotice('Unsubscribed from Wall reminders.');
          })
        }
      >
        {t('Unsubscribe from this Wall')}
      </button>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
    </section>
  );
}
