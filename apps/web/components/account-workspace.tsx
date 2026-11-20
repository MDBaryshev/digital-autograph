'use client';
import { ProfileAvatarEditor } from './profile-avatar-editor';
import { OwnerRejectionDetails } from './owner-rejection-details';
import { WallLifecycleControls } from './wall-lifecycle-controls';
import type { AutographStatus, WallStatus } from '@digital-autograph/domain';
import { isPublicWall } from '@digital-autograph/domain';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import { AccountSession } from './account-session';
import { ThemeSwitcher } from './theme-switcher';
import { LanguageSwitcher } from './language-switcher';
import {
  getWorkspace,
  workspaceRequest,
  type Workspace,
} from './workspace-api';
import { myWallPath, wallDesignPath } from '../lib/wall-design-links';
import { autographApi } from '../lib/autograph-api';
import { CleanedAutographReview } from './cleaned-autograph-review';
import { FirstUseActionNotice } from './first-use-action-notice';
import styles from './workspace.module.css';
type Section = 'overview' | 'autographs' | 'walls' | 'settings';
const statuses: Record<AutographStatus | WallStatus, string> = {
  draft: 'Draft',
  upload_pending: 'Waiting for upload',
  uploaded_unverified: 'Verifying upload',
  processing: 'Processing',
  awaiting_approval: 'Review your preview',
  awaiting_moderation: 'Awaiting moderation',
  ready: 'Approved',
  moderation_rejected: 'Rejected',
  processing_failed: 'Processing failed',
  live: 'Live',
  paused: 'Paused',
  scheduled: 'Scheduled',
  ended: 'Ended',
  archived: 'Archived',
};
export function AccountWorkspace({
  apiOrigin,
  section = 'overview',
  wallId,
}: {
  apiOrigin: string;
  section?: Section;
  wallId?: string;
}) {
  const { t, locale } = useLocale();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    status: string;
    assetId: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const c = new AbortController();
    getWorkspace(apiOrigin, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(
            e.message === 'SIGN_IN'
              ? 'SIGN_IN'
              : 'Could not load your account. Please retry.',
          );
      });
    return () => c.abort();
  }, [apiOrigin, version]);
  const act = async (
    work: (signal: AbortSignal) => Promise<unknown>,
    notify = true,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setSaved(false);
    const c = new AbortController();
    mutation.current = c;
    try {
      await work(c.signal);
      if (!c.signal.aborted) {
        setVersion((v) => v + 1);
        window.dispatchEvent(new Event('destka-workspace-updated'));
        if (notify) setSaved(true);
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error &&
            [
              'FIRST_USE_REQUIRED',
              'LEGAL_DOCUMENT_UNAVAILABLE',
              'LEGAL_DOCUMENT_CHANGED',
            ].includes(e.message)
            ? 'FIRST_USE_REQUIRED'
            : e instanceof Error &&
                e.message === 'PROFILE_PUBLICATION_UNAVAILABLE'
              ? 'Profile changes are temporarily unavailable.'
              : e instanceof Error && e.message === 'SLUG_TAKEN'
                ? 'This username is already taken.'
                : e instanceof Error && e.message === 'WALL_ALREADY_EXISTS'
                  ? 'Your account already has its Wall with 10 places.'
                  : 'Could not save changes. Refresh before retrying.',
        );
    } finally {
      busy.current = false;
      if (!c.signal.aborted) setPending(false);
    }
  };
  const preferences =
    section === 'settings' ? (
      <section className={styles.card}>
        <h2>{t('Appearance and language')}</h2>
        <div className={styles.actions}>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </section>
    ) : null;
  const accountPath = section === 'overview' ? '/me' : `/me/${section}`;
  const returnTo =
    section === 'autographs' && wallId
      ? `${accountPath}?wall=${wallId}`
      : accountPath;
  if (error === 'SIGN_IN')
    return (
      <div className={styles.workspace}>
        {preferences}
        <AccountSession
          apiOrigin={apiOrigin}
          returnTo={returnTo}
          onSignedOut={() => window.location.assign('/me')}
        />
      </div>
    );
  if (!data)
    return (
      <section>
        {preferences}
        <p role={error ? 'alert' : 'status'}>
          {t(error || 'Loading your space…')}
        </p>
        {error && (
          <button onClick={() => setVersion((v) => v + 1)}>{t('Retry')}</button>
        )}
      </section>
    );
  const { profile, wall } = data;
  const date = (s: string) =>
    new Date(s).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB');
  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label={t('Account sections')}>
        {(
          [
            ['overview', '/me', 'Overview'],
            ['autographs', '/me/autographs', 'My autographs'],
            ['walls', myWallPath, 'My Wall'],
            ['settings', '/me/settings', 'Settings'],
          ] as const
        ).map(([key, url, label]) => (
          <a
            key={key}
            href={url}
            aria-current={section === key ? 'page' : undefined}
          >
            {t(label)}
          </a>
        ))}
      </nav>
      {error === 'FIRST_USE_REQUIRED' ? (
        <FirstUseActionNotice returnTo="/me/settings" />
      ) : (
        error && <p role="alert">{t(error)}</p>
      )}
      {saved && <p role="status">{t('Changes saved.')}</p>}
      {section === 'overview' && (
        <>
          <div className={styles.actions}>
            <span className={styles.avatar} aria-hidden="true">
              {profile?.avatarDataUrl ? (
                <img
                  className={styles.profileAvatar}
                  src={profile.avatarDataUrl}
                  alt=""
                />
              ) : (
                <>
                  {Array.from(profile?.displayName ?? '')[0]?.toUpperCase() ??
                    'D'}
                </>
              )}
            </span>
            <div>
              <h2>{profile?.displayName ?? t('Your space')}</h2>
              <p className={styles.muted}>
                {profile
                  ? '@' + profile.slug
                  : data.canEditProfile
                    ? t('Choose a name in settings to create your Wall.')
                    : t('Public profile setup is temporarily unavailable.')}
              </p>
            </div>
          </div>
          <div className={styles.grid}>
            <section className={styles.card}>
              <h2>{t('My autographs')}</h2>
              <p>
                {t('Your drawings, private previews and moderation status.')}
              </p>
              <a href="/me/autographs">{t('Open my autographs')} →</a>
            </section>
            <section className={styles.card}>
              <h2>{t('My Wall')}</h2>
              <p>
                {wall
                  ? `${t(statuses[wall.status])} · ${t('Places: {count}', { count: wall.slotCount })}`
                  : t('Create a Wall and invite people to leave their mark.')}
              </p>
              <a href={myWallPath}>
                {t(wall ? 'Manage my Wall' : 'Open my Wall')} →
              </a>
            </section>
          </div>
        </>
      )}
      {section === 'autographs' && (
        <>
          <p>
            {t(
              'Original uploads stay private. Only you can review these previews.',
            )}
          </p>
          <a className={styles.primary} href="/autograph/create">
            {t('Create autograph')}
          </a>
          {data.autographs.length === 0 ? (
            <p>{t('No autographs yet. Start with a drawing or a photo.')}</p>
          ) : (
            <div className={styles.grid}>
              {data.autographs.map((a) => (
                <article className={styles.card} key={a.id}>
                  <h2>{t(a.source === 'canvas' ? 'Drawing' : 'Photo')}</h2>
                  <p>{date(a.createdAt)}</p>
                  <p>{t(statuses[a.status] ?? a.status)}</p>
                  {a.status === 'moderation_rejected' && (
                    <OwnerRejectionDetails
                      apiOrigin={apiOrigin}
                      autographId={a.id}
                    />
                  )}
                  {[
                    'awaiting_approval',
                    'awaiting_moderation',
                    'ready',
                    'moderation_rejected',
                  ].includes(a.status) && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        void act(async (signal) => {
                          const p = await autographApi(apiOrigin).preview(
                            a.id,
                            signal,
                          );
                          setPreview({ id: a.id, status: a.status, ...p });
                        }, false)
                      }
                    >
                      {t('Open private preview')}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {preview && (
            <section className={styles.card}>
              <button onClick={() => setPreview(null)}>
                {t('Close preview')}
              </button>
              {preview.status === 'awaiting_approval' ? (
                <CleanedAutographReview
                  key={preview.id}
                  autographId={preview.id}
                  api={autographApi(apiOrigin)}
                  initialPreview={preview}
                  onStartOver={() => setPreview(null)}
                />
              ) : (
                <img
                  src={preview.url}
                  alt={t('Your private cleaned autograph')}
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setPreview(null);
                    setError('Preview expired. Open it again.');
                  }}
                />
              )}
            </section>
          )}
          <p className={styles.muted}>
            {t(
              'Showing up to 50 recent autographs. Refresh to update processing status.',
            )}
          </p>
          <button onClick={() => setVersion((v) => v + 1)}>
            {t('Refresh')}
          </button>
        </>
      )}
      {section === 'walls' && (
        <>
          {wall ? (
            <article className={`${styles.card} ${styles.wallCard}`}>
              <div className={styles.wallHeading}>
                <h2>
                  {profile
                    ? t('{name}’s Wall', { name: profile.displayName })
                    : t('Wall')}
                </h2>
                <p>
                  {t(statuses[wall.status])} ·{' '}
                  {t('Places: {count}', { count: wall.slotCount })}
                </p>
              </div>
              <div className={styles.actions}>
                {wall.status !== 'archived' && (
                  <a className={styles.primary} href={wallDesignPath}>
                    {t('Edit Wall appearance')}
                  </a>
                )}
                {isPublicWall(wall.status) && (
                  <a href={`/walls/${wall.id}`}>{t('Open Wall')}</a>
                )}
              </div>
              <WallLifecycleControls
                key={wall.id}
                apiOrigin={apiOrigin}
                wall={wall}
                refresh={async (signal) => {
                  const next = await getWorkspace(apiOrigin, signal);
                  if (!signal.aborted) setData(next);
                }}
              />
            </article>
          ) : !data.canEditProfile ? (
            <section className={styles.card}>
              <h2>{t('Wall creation is temporarily unavailable')}</h2>
              <p>
                {t(
                  'A public profile is required to create a Wall. You can still create an autograph.',
                )}
              </p>
              <a className={styles.primary} href="/autograph/create">
                {t('Create autograph')}
              </a>
            </section>
          ) : !profile ? (
            <section className={styles.card}>
              <h2>{t('Set up your public profile')}</h2>
              <p>
                {t(
                  'Set up your public creator profile first. Your original uploads will remain private.',
                )}
              </p>
              <a href="/me/settings">{t('Set up profile')} →</a>
            </section>
          ) : (
            <section className={styles.card}>
              <p>
                {t(
                  'Your account has one Wall with exactly 10 places. A new Wall starts as a private draft.',
                )}
              </p>
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void act((signal) =>
                    workspaceRequest(
                      apiOrigin,
                      `/creators/${profile.id}/walls`,
                      signal,
                      {},
                    ),
                  );
                }}
              >
                <button disabled={pending}>
                  {pending ? t('Saving…') : t('Create draft Wall')}
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {section === 'settings' && (
        <>
          <section className={styles.card}>
            <h2>{t('Public profile')}</h2>
            {!data.canEditProfile && (
              <p role="status">
                {t('Profile changes are temporarily unavailable.')}
              </p>
            )}
            <p>
              {t(
                'Your name and username appear on your creator page. Your sign-in details stay private.',
              )}
            </p>
            <form
              key={profile?.slug ?? 'new'}
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act((signal) =>
                  workspaceRequest(
                    apiOrigin,
                    '/me/profile',
                    signal,
                    { displayName: f.get('displayName'), slug: f.get('slug') },
                    'PUT',
                  ),
                );
              }}
            >
              <label>
                {t('Display name')}
                <input
                  name="displayName"
                  disabled={pending || !data.canEditProfile}
                  maxLength={400}
                  onInput={(event) =>
                    event.currentTarget.setCustomValidity(
                      Array.from(event.currentTarget.value).length > 200
                        ? t('Use at most 200 characters for your display name.')
                        : '',
                    )
                  }
                  defaultValue={profile?.displayName ?? ''}
                  required
                  autoComplete="nickname"
                />
              </label>
              <label>
                {t('Username')}
                <input
                  name="slug"
                  disabled={pending || !data.canEditProfile}
                  minLength={1}
                  maxLength={128}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  defaultValue={profile?.slug ?? ''}
                  required
                  aria-describedby="username-help"
                />
              </label>
              <p id="username-help">
                {t(
                  'Use lowercase Latin letters, numbers and hyphens. Changing this changes your public profile link.',
                )}
              </p>
              <button disabled={pending || !data.canEditProfile}>
                {pending ? t('Saving…') : t('Save profile')}
              </button>
              {profile && (
                <a href={`/creators/${profile.slug}`}>
                  {t('Open public profile')}
                </a>
              )}
            </form>
          </section>
          <ProfileAvatarEditor
            apiOrigin={apiOrigin}
            canEdit={data.canEditProfile}
          />
          {preferences}
          <section className={styles.card}>
            <h2>{t('Session')}</h2>
            <AccountSession
              apiOrigin={apiOrigin}
              onSignedOut={() => window.location.assign('/me')}
            />
          </section>
        </>
      )}
    </div>
  );
}
