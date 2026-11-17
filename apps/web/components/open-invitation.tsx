'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { wallIdParams } from '@digital-autograph/contracts';
import { useLocale } from './locale-provider';
import { Icon } from './ui-icon';
import styles from './open-invitation.module.css';

function invitationPath(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim(), origin);
    if (
      url.username ||
      url.password ||
      ![origin, 'https://destka.ru', 'https://www.destka.ru'].includes(
        url.origin,
      )
    )
      return null;
    const match = /^\/walls\/([^/]+)\/?$/.exec(url.pathname);
    const result = wallIdParams.safeParse({ id: match?.[1] });
    return result.success ? `/walls/${result.data.id}` : null;
  } catch {
    return null;
  }
}

export function OpenInvitation() {
  const { t } = useLocale();
  const field = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = fieldRef.current;
    if (!input) return;
    const path = invitationPath(input.value, window.location.origin);
    if (path) {
      window.location.assign(path);
    } else {
      setInvalid(true);
      input.focus();
    }
  };

  return (
    <details className={styles.invite} id="open-invitation">
      <summary>
        <Icon name="link" size={19} /> {t('Open an invitation')}
        <Icon name="down" size={16} />
      </summary>
      <form action="/#open-invitation" onSubmit={submit}>
        <label htmlFor={field}>{t('Paste your Destka invitation link')}</label>
        <div className={styles.fields}>
          <input
            id={field}
            ref={fieldRef}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={2048}
            placeholder="https://destka.ru/walls/…"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${field}-error` : undefined}
            onChange={() => setInvalid(false)}
          />
          <button type="submit">{t('Open Wall')}</button>
        </div>
        {invalid && (
          <p id={`${field}-error`} role="alert">
            {t('Paste a link to a Wall on destka.ru.')}
          </p>
        )}
      </form>
    </details>
  );
}
