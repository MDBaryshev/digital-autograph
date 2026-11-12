'use client';
import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { BrandMark, Icon } from './ui-icon';
import { useLocale } from './locale-provider';
import { workspaceRequest, type Workspace } from './workspace-api';
import styles from './workspace-navigation.module.css';
export function WorkspaceNavigation({ apiOrigin }: { apiOrigin: string }) {
  const { t } = useLocale();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener('destka-workspace-updated', refresh);
    return () =>
      window.removeEventListener('destka-workspace-updated', refresh);
  }, []);
  const [account, setAccount] = useState<Workspace | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const c = new AbortController();
    workspaceRequest<Workspace>(apiOrigin, '/me/workspace', c.signal)
      .then((data) => {
        if (!c.signal.aborted) setAccount(data);
      })
      .catch(() => {
        if (!c.signal.aborted) setAccount(null);
      });
    return () => c.abort();
  }, [apiOrigin, path, revision]);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      )
        setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  const links: [string, string, Parameters<typeof Icon>[0]['name']][] = account
    ? [
        ['/me', 'Overview', 'user'],
        ['/me/autographs', 'My autographs', 'pen'],
        ['/me/walls', 'My Walls', 'globe'],
        ['/me/placements', 'Placement history', 'history'],
        ['/me/notifications', 'Notifications', 'bell'],
        ['/me/shares', 'My public links', 'globe'],
      ]
    : [['/#how-it-works', 'How it works', 'globe']];
  if (account?.canModerate) links.push(['/moderation', 'Moderation', 'check']);
  links.push(['/me/settings', 'Settings', 'theme']);
  const accountLabel = account
    ? account.profile?.displayName || t('Your account')
    : t('Sign in');

  return (
    <header ref={header} className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.brand} href="/" aria-label="Destka">
          <BrandMark />
          <span>Destka</span>
        </a>
        <div className={styles.actions}>
          <a
            className={styles.studioLink}
            href="/autograph/create"
            aria-current={path === '/autograph/create' ? 'page' : undefined}
          >
            {t('Autograph studio')}
          </a>
          <a
            className={styles.accountLink}
            href="/me"
            aria-label={accountLabel}
          >
            {account && (
              <span className={styles.avatar} aria-hidden="true">
                {account.profile?.avatarDataUrl ? (
                  <img src={account.profile.avatarDataUrl} alt="" />
                ) : (
                  (Array.from(
                    account.profile?.displayName ?? '',
                  )[0]?.toUpperCase() ?? <Icon name="user" size={18} />)
                )}
              </span>
            )}
            <span className={account ? styles.accountName : undefined}>
              {accountLabel}
            </span>
          </a>
          <button
            className={styles.toggle}
            ref={toggle}
            type="button"
            aria-label={open ? t('Close menu') : t('Menu')}
            aria-expanded={open}
            aria-controls="workspace-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
        <nav
          id="workspace-menu"
          aria-label={t('Main navigation')}
          className={styles.menu}
          hidden={!open}
        >
          {links.map(([href, label, icon]) => {
            const newTab =
              path === '/autograph/create' && href === '/me/settings';
            return (
              <a
                key={href}
                href={href}
                target={newTab ? '_blank' : undefined}
                rel={newTab ? 'noopener noreferrer' : undefined}
                aria-label={
                  newTab ? t('Settings (opens in a new tab)') : undefined
                }
                aria-current={path === href ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon name={icon} size={18} /> {t(label)}
              </a>
            );
          })}
          <a
            className={styles.mobileStudio}
            href="/autograph/create"
            onClick={() => setOpen(false)}
          >
            <Icon name="pen" size={18} /> {t('Autograph studio')}
          </a>
        </nav>
      </div>
    </header>
  );
}
