'use client';

import {
  emptyWallDesign,
  isPublicWall,
  type WallDesign,
} from '@digital-autograph/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appearanceImageFile } from '../lib/appearance-image-file';
import { readWallDesignFile } from '../lib/wall-design-file';
import {
  myWallPath,
  wallDesignTemplateLink,
  wallDesignTokenFromLink,
} from '../lib/wall-design-links';
import { AccountSession } from './account-session';
import { FirstUseActionNotice } from './first-use-action-notice';
import { useLocale } from './locale-provider';
import { WallDesignFields, type DesignImage } from './wall-design-fields';
import { WallDesignFileControls } from './wall-design-file-controls';
import { WallDesignPreview } from './wall-design-preview';
import {
  getWorkspace,
  workspaceRequest,
  type Workspace,
} from './workspace-api';
import styles from './wall-design-studio.module.css';

type Editor = {
  design: WallDesign;
  revision: string | null;
  editable: boolean;
};
type Access =
  | { kind: 'loading' | 'anonymous' | 'forbidden' | 'error' | 'admin' }
  | { kind: 'no-wall'; archived: boolean }
  | { kind: 'owner'; wall: NonNullable<Workspace['wall']>; editable: boolean };

const errorCopy: Record<string, string> = {
  AUTHOR_NOT_FOUND: 'No active author has this username.',
  TEMPLATE_NOT_FOUND: 'This template is expired or belongs to another author.',
  INVALID_LINK: 'Paste a template link from this Supcube site.',
  INVALID_DESIGN_FILE: 'Choose a valid Supcube wall design file.',
  DESIGN_CHANGED:
    'Someone saved another version. Reload the saved design before replacing it.',
  INVALID_APPEARANCE_IMAGE:
    'Choose a PNG, JPEG or WebP image up to 10 MB and 20 megapixels.',
  PROFILE_PUBLICATION_UNAVAILABLE:
    'Wall design publishing is temporarily unavailable.',
  FORBIDDEN: 'You do not have access to this editor.',
  SIGN_IN: 'Your session expired. Sign in again to edit your Wall.',
  APPEARANCE_BUSY: 'The image processor is busy. Try again in a moment.',
};

export function WallDesignStudio({
  apiOrigin,
  mode,
  path,
}: {
  apiOrigin: string;
  mode: 'owner' | 'admin';
  path: string;
}) {
  const { t, locale } = useLocale();
  const [access, setAccess] = useState<Access>({ kind: 'loading' });
  const [design, setDesign] = useState<WallDesign>(emptyWallDesign);
  const [revision, setRevision] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [author, setAuthor] = useState('');
  const [importLink, setImportLink] = useState('');
  const [generated, setGenerated] = useState<{
    link: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const workspace = await getWorkspace(apiOrigin, signal);
        if (signal.aborted) return;
        if (mode === 'admin') {
          setAccess({
            kind: workspace.canManageWallDesigns ? 'admin' : 'forbidden',
          });
          return;
        }
        setOwnerName(workspace.profile?.displayName ?? '');
        const { wall } = workspace;
        if (!wall || wall.status === 'archived') {
          setAccess({
            kind: 'no-wall',
            archived: wall?.status === 'archived',
          });
          return;
        }
        const saved = await workspaceRequest<Editor>(
          apiOrigin,
          `/me/walls/${wall.id}/design`,
          signal,
        );
        if (signal.aborted) return;
        setDesign(saved.design);
        setRevision(saved.revision);
        setAccess({ kind: 'owner', wall, editable: saved.editable });
        setNeedsReload(false);
      } catch (error) {
        if (!signal.aborted)
          setAccess({
            kind:
              error instanceof Error && error.message === 'SIGN_IN'
                ? 'anonymous'
                : 'error',
          });
      }
    },
    [apiOrigin, mode],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    if (
      mode === 'owner' &&
      wallDesignTokenFromLink(window.location.href, window.location.origin)
    ) {
      setImportLink(window.location.href);
    }
    return () => {
      controller.abort();
      mutation.current?.abort();
    };
  }, [load, mode]);

  useEffect(() => {
    if (generated) linkInput.current?.focus();
  }, [generated]);

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    mutation.current = controller;
    try {
      await work(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) {
        const code = failure instanceof Error ? failure.message : '';
        setError(code || 'REQUEST_FAILED');
        if (code === 'DESIGN_CHANGED') setNeedsReload(true);
      }
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function update(next: WallDesign) {
    setDesign(next);
    setNotice('');
    setGenerated(null);
  }

  function addImage(field: DesignImage, file: File) {
    void run(async (signal) => {
      const source = await appearanceImageFile(
        file,
        field === 'avatarDataUrl' ? 'avatar' : 'wall-cover',
      ).catch(() => {
        throw Error('INVALID_APPEARANCE_IMAGE');
      });
      if (!signal.aborted) update({ ...design, [field]: source });
    });
  }

  function importTemplate(wallId: string) {
    void run(async (signal) => {
      const token = wallDesignTokenFromLink(importLink, window.location.origin);
      if (!token) throw Error('INVALID_LINK');
      const result = await workspaceRequest<{ design: WallDesign }>(
        apiOrigin,
        `/me/walls/${wallId}/design/import-preview`,
        signal,
        { token },
      );
      if (!signal.aborted) {
        setDesign(result.design);
        setNotice('Template loaded. Check the preview, then save the design.');
      }
    });
  }

  function importFile(file: File) {
    void run(async (signal) => {
      const next = await readWallDesignFile(file).catch(() => {
        throw Error('INVALID_DESIGN_FILE');
      });
      if (!signal.aborted) {
        update(next);
        setNotice('Design file loaded into the preview.');
      }
    });
  }

  function saveWall(wallId: string) {
    void run(async (signal) => {
      const saved = await workspaceRequest<Editor>(
        apiOrigin,
        `/me/walls/${wallId}/design`,
        signal,
        { design, revision },
        'PUT',
      );
      if (!signal.aborted) {
        setDesign(saved.design);
        setRevision(saved.revision);
        setNotice('Wall design saved.');
      }
    });
  }

  function createTemplate() {
    void run(async (signal) => {
      const result = await workspaceRequest<{
        token: string;
        expiresAt: string;
      }>(apiOrigin, '/admin/wall-design-templates', signal, {
        author: author.trim().replace(/^@/, ''),
        design,
      });
      if (!signal.aborted) {
        setGenerated({
          link: wallDesignTemplateLink(window.location.origin, result.token),
          expiresAt: result.expiresAt,
        });
      }
    });
  }

  const requiresConsent = [
    'FIRST_USE_REQUIRED',
    'LEGAL_DOCUMENT_UNAVAILABLE',
    'LEGAL_DOCUMENT_CHANGED',
  ].includes(error);
  const alert = requiresConsent ? (
    <FirstUseActionNotice returnTo={path} />
  ) : (
    error && (
      <p role="alert">
        {t(errorCopy[error] ?? 'Could not complete the request.')}
      </p>
    )
  );

  if (access.kind === 'anonymous')
    return (
      <>
        {mode === 'owner' && (
          <p>
            <a href="/walls/demo">{t('Try without signing in')}</a>
          </p>
        )}
        <AccountSession apiOrigin={apiOrigin} returnTo={path} />
      </>
    );
  if (access.kind === 'loading')
    return <p role="status">{t('Loading your space…')}</p>;
  if (access.kind === 'forbidden')
    return <p role="alert">{t(errorCopy.FORBIDDEN!)}</p>;
  if (access.kind === 'error')
    return (
      <div>
        <p role="alert">{t('Could not load your account. Please retry.')}</p>
        <button type="button" disabled={pending} onClick={() => void run(load)}>
          {t('Retry')}
        </button>
      </div>
    );
  if (access.kind === 'no-wall') {
    return (
      <section className={styles.group}>
        <h2>
          {t(
            access.archived
              ? 'Your Wall is archived'
              : 'Create your Wall to customize it',
          )}
        </h2>
        <a href={myWallPath}>{t('My Wall')}</a>
      </section>
    );
  }
  const ownsWall = access.kind === 'owner';
  const editable = !ownsWall || access.editable;
  return (
    <>
      <div className={styles.meta}>
        <a href={myWallPath}>{t('My Wall')}</a>
        {ownsWall && isPublicWall(access.wall.status) && (
          <a href={`/walls/${access.wall.id}`}>{t('Open Wall')}</a>
        )}
        {!editable && (
          <span>{t(errorCopy.PROFILE_PUBLICATION_UNAVAILABLE!)}</span>
        )}
      </div>
      <div className={styles.editor}>
        <div className={styles.controls}>
          {ownsWall ? (
            <form
              className={styles.group}
              onSubmit={(event) => {
                event.preventDefault();
                importTemplate(access.wall.id);
              }}
            >
              <h2>{t('Import a template')}</h2>
              <label>
                {t('Template link')}
                <input
                  type="url"
                  required
                  value={importLink}
                  maxLength={2048}
                  onChange={(event) => setImportLink(event.target.value)}
                />
              </label>
              <button type="submit" disabled={pending || !editable}>
                {t('Load template')}
              </button>
            </form>
          ) : (
            <section className={styles.group}>
              <label>
                {t('Author username')}
                <input
                  value={author}
                  autoComplete="off"
                  maxLength={129}
                  placeholder="@polina"
                  onChange={(event) => {
                    setAuthor(event.target.value);
                    setGenerated(null);
                  }}
                />
              </label>
            </section>
          )}
          <WallDesignFileControls
            design={design}
            disabled={pending || !editable}
            onImport={importFile}
          />
          {alert}
          {(notice.startsWith('Template loaded') ||
            notice === 'Design file loaded into the preview.') && (
            <p role="status">{t(notice)}</p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (ownsWall) saveWall(access.wall.id);
              else createTemplate();
            }}
          >
            <fieldset className={styles.fields} disabled={pending || !editable}>
              <WallDesignFields
                value={design}
                update={update}
                onImage={addImage}
              />
              <div className={`${styles.group} ${styles.submit}`}>
                <button
                  className="primaryLink"
                  type="submit"
                  disabled={ownsWall ? needsReload : !author.trim()}
                >
                  {t(ownsWall ? 'Save Wall design' : 'Create template link')}
                </button>
                {notice === 'Wall design saved.' && (
                  <p role="status">{t(notice)}</p>
                )}
                {needsReload && (
                  <button type="button" onClick={() => void run(load)}>
                    {t('Reload saved design')}
                  </button>
                )}
              </div>
            </fieldset>
          </form>
          {generated && (
            <section className={styles.group}>
              <label>
                {t('Share this link with the author')}
                <input
                  ref={linkInput}
                  readOnly
                  value={generated.link}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generated.link);
                    setNotice('Template link copied.');
                  } catch {
                    linkInput.current?.focus();
                  }
                }}
              >
                {t('Copy template link')}
              </button>
              {notice === 'Template link copied.' && (
                <p role="status">{t(notice)}</p>
              )}
              <p>
                {t('Link expires {date}.', {
                  date: new Date(generated.expiresAt).toLocaleDateString(
                    locale,
                  ),
                })}
              </p>
            </section>
          )}
        </div>
        <WallDesignPreview
          design={design}
          owner={ownsWall ? ownerName : author}
          onChange={update}
          materialsDisabled={pending || !editable}
        />
      </div>
    </>
  );
}
