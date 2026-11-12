'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { emailConfirmationReturnPath } from '@digital-autograph/contracts';
import { useLocale } from './locale-provider';
import styles from './email-auth-form.module.css';

type Mode = 'login' | 'register' | 'reset' | 'confirm';
const safePath = (value: string | null) =>
  value &&
  /^\/(?!\/)/.test(value) &&
  !/[\\\s]/.test(value) &&
  !value.split(/[?#]/, 1)[0]?.includes('%') &&
  ![...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  )
    ? value
    : '/me';

export function EmailAuthForm({
  apiOrigin,
  confirm = false,
}: {
  apiOrigin: string;
  confirm?: boolean;
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState<Mode>(confirm ? 'confirm' : 'login');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(!confirm);
  const pendingRef = useRef(false);
  const returnTo = useRef('/me');
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    returnTo.current = safePath(
      new URLSearchParams(window.location.search).get('returnTo'),
    );
    if (confirm) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const value = fragment.get('token') ?? '';
      returnTo.current =
        emailConfirmationReturnPath(fragment.get('returnTo')) ?? '/me';
      // Keep the credential out of history, referrers, query strings and browser storage.
      window.history.replaceState(null, '', window.location.pathname);
      if (/^[A-Za-z0-9_-]{43}$/.test(value)) {
        setToken(value);
        setReady(true);
      } else
        setError('This link is invalid or has expired. Request a new email.');
    }
  }, [confirm]);
  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (
      mode === 'confirm' &&
      ([...password].length < 15 || [...password].length > 128)
    ) {
      setError(
        'Use 15–128 characters. Spaces and password managers are supported.',
      );
      return;
    }
    if (mode === 'confirm' && password !== data.get('repeatPassword')) {
      setError('Passwords do not match.');
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/email/${mode}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'confirm'
            ? { token, password }
            : {
                email: String(data.get('email') ?? ''),
                ...(mode === 'login'
                  ? { password }
                  : {
                      returnTo: emailConfirmationReturnPath(returnTo.current),
                    }),
              },
        ),
      });
      form
        .querySelectorAll<HTMLInputElement>('input[type="password"]')
        .forEach((input) => {
          input.value = '';
        });
      if (response.status === 429) {
        setError('Too many attempts. Please try again later.');
        return;
      }
      if (response.status === 409) {
        window.location.assign(returnTo.current);
        return;
      }
      if (!response.ok) {
        setError(
          mode === 'login' && response.status === 401
            ? 'Email or password is incorrect.'
            : mode === 'confirm' && response.status === 400
              ? 'This link is invalid or has expired. Request a new email.'
              : 'Could not complete the request. Please try again.',
        );
        return;
      }
      if (mode === 'login') {
        window.location.assign(returnTo.current);
        return;
      }
      if (mode === 'confirm') {
        setToken('');
        setMode('login');
        setMessage(
          'Your password is saved. Sign in with your email and password.',
        );
      } else
        setMessage(
          'If this address can be used, an email with a link will arrive shortly. Check your spam folder too.',
        );
    } catch {
      setError('Could not complete the request. Please try again.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const titles: Record<Mode, string> = {
    login: 'Sign in with email',
    register: 'Create an account',
    reset: 'Reset password',
    confirm: 'Set your password',
  };
  return (
    <section className={styles.panel} aria-labelledby="email-auth-title">
      <h1 id="email-auth-title">{t(titles[mode])}</h1>
      {mode === 'register' && (
        <p>
          {t(
            'We will send a confirmation link. You will create your password after confirming your email.',
          )}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {ready && (
        <form onSubmit={submit} className={styles.form}>
          {mode !== 'confirm' && (
            <label>
              {t('Email')}
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'confirm') && (
            <label>
              {t('Password')}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                minLength={mode === 'confirm' ? 15 : 1}
                maxLength={256}
              />
            </label>
          )}
          {mode === 'confirm' && (
            <>
              <p>
                {t(
                  'Use 15–128 characters. Spaces and password managers are supported.',
                )}
              </p>
              <label>
                {t('Repeat password')}
                <input
                  name="repeatPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={15}
                  maxLength={256}
                />
              </label>
            </>
          )}
          <button type="submit" disabled={pending}>
            {t(
              pending
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'confirm'
                    ? 'Save password'
                    : 'Send email',
            )}
          </button>
        </form>
      )}
      <nav className={styles.actions} aria-label={t('Sign-in options')}>
        {mode !== 'login' && (
          <button
            disabled={pending}
            type="button"
            onClick={() => {
              setReady(true);
              switchMode('login');
            }}
          >
            {t('Sign in with email')}
          </button>
        )}
        {mode !== 'register' && (
          <button
            disabled={pending}
            type="button"
            onClick={() => {
              setReady(true);
              switchMode('register');
            }}
          >
            {t('Create an account')}
          </button>
        )}
        {mode !== 'reset' && (
          <button
            disabled={pending}
            type="button"
            onClick={() => {
              setReady(true);
              switchMode('reset');
            }}
          >
            {t('Forgot password?')}
          </button>
        )}
        <a href="/me">{t('Other sign-in options')}</a>
      </nav>
    </section>
  );
}
