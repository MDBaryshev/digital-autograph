'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import { workspaceRequest } from './workspace-api';
import styles from './workspace.module.css';
import { FirstUseActionNotice } from './first-use-action-notice';
import { appearanceImageFile } from '../lib/appearance-image-file';

type Appearance = {
  title: string;
  description: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
  providerAvatarDataUrl: string | null;
  avatarSource: 'provider' | 'upload' | 'none' | null;
};
export function WallAppearanceEditor({
  apiOrigin,
  canEdit,
}: {
  apiOrigin: string;
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState<Appearance | null>(null);
  const [source, setSource] = useState<'provider' | 'upload' | 'none'>('none');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    workspaceRequest<Appearance>(apiOrigin, '/me/appearance', c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setValue(d);
        setSource(
          d.avatarSource ??
            (d.avatarDataUrl
              ? 'upload'
              : d.providerAvatarDataUrl
                ? 'provider'
                : 'none'),
        );
        setError('');
      })
      .catch(() => {
        if (!c.signal.aborted) setError('Could not load Wall appearance.');
      });
    return () => c.abort();
  }, [apiOrigin, version]);
  const avatar =
    source === 'provider'
      ? value?.providerAvatarDataUrl
      : source === 'upload'
        ? value?.avatarDataUrl
        : null;
  return (
    <section className={styles.card}>
      <h2>{t('Wall appearance')}</h2>
      <p>
        {t(
          'Choose a name, avatar and cover. Saving publishes this appearance on your Wall.',
        )}
      </p>
      {error === 'FIRST_USE_REQUIRED' ? (
        <FirstUseActionNotice returnTo="/me/settings" />
      ) : (
        error && <p role="alert">{t(error)}</p>
      )}
      {saved && <p role="status">{t('Wall appearance saved.')}</p>}
      {!value ? (
        <button type="button" onClick={() => setVersion((v) => v + 1)}>
          {t('Retry')}
        </button>
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (busy.current) return;
            busy.current = true;
            setPending(true);
            setError('');
            setSaved(false);
            void workspaceRequest(
              apiOrigin,
              '/me/appearance',
              controller.current!.signal,
              {
                title: value.title,
                description: value.description,
                avatarSource: source,
                avatarDataUrl: value.avatarDataUrl,
                coverDataUrl: value.coverDataUrl,
              },
              'PUT',
            )
              .then(() => {
                setSaved(true);
                window.dispatchEvent(new Event('destka-workspace-updated'));
              })
              .catch((e) =>
                setError(
                  e instanceof Error &&
                    [
                      'FIRST_USE_REQUIRED',
                      'LEGAL_DOCUMENT_UNAVAILABLE',
                      'LEGAL_DOCUMENT_CHANGED',
                    ].includes(e.message)
                    ? 'FIRST_USE_REQUIRED'
                    : 'Could not save Wall appearance.',
                ),
              )
              .finally(() => {
                busy.current = false;
                setPending(false);
              });
          }}
        >
          <fieldset disabled={!canEdit || pending}>
            <label>
              {t('Wall name')}
              <input
                maxLength={100}
                value={value.title}
                onChange={(e) => setValue({ ...value, title: e.target.value })}
              />
            </label>
            <label>
              {t('Wall description')}
              <textarea
                maxLength={500}
                value={value.description}
                onChange={(e) =>
                  setValue({ ...value, description: e.target.value })
                }
              />
            </label>
            <label>
              {t('Avatar source')}
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
              >
                <option value="none">{t('Initials only')}</option>
                {value.providerAvatarDataUrl && (
                  <option value="provider">
                    {t('Photo from sign-in account')}
                  </option>
                )}
                <option value="upload">{t('My uploaded photo')}</option>
              </select>
            </label>
            {avatar && (
              <img
                className={styles.profileAvatar}
                src={avatar}
                alt={t('Avatar preview')}
              />
            )}
            <label>
              {t('Upload avatar')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setPending(true);
                  setError('');
                  void appearanceImageFile(f, 'avatar')
                    .then((data) => {
                      setValue((v) => (v ? { ...v, avatarDataUrl: data } : v));
                      setSource('upload');
                    })
                    .catch(() =>
                      setError(
                        'Choose a PNG, JPEG or WebP image up to 10 MB and 20 megapixels.',
                      ),
                    )
                    .finally(() => setPending(false));
                }}
              />
            </label>
            {value.coverDataUrl && (
              <img
                className={styles.coverPreview}
                src={value.coverDataUrl}
                alt={t('Cover preview')}
              />
            )}
            <label>
              {t('Upload cover')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setPending(true);
                  setError('');
                  void appearanceImageFile(f, 'cover')
                    .then((data) =>
                      setValue((v) => (v ? { ...v, coverDataUrl: data } : v)),
                    )
                    .catch(() =>
                      setError(
                        'Choose a PNG, JPEG or WebP image up to 10 MB and 20 megapixels.',
                      ),
                    )
                    .finally(() => setPending(false));
                }}
              />
            </label>
            {value.coverDataUrl && (
              <button
                type="button"
                onClick={() => setValue({ ...value, coverDataUrl: null })}
              >
                {t('Remove cover')}
              </button>
            )}
            <p>
              {t(
                'Images are cropped to fit. Check the previews before saving.',
              )}
            </p>
            <button
              type="submit"
              disabled={source === 'upload' && !value.avatarDataUrl}
            >
              {pending ? t('Saving…') : t('Save Wall appearance')}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
