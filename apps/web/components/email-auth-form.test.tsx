// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EmailAuthForm } from './email-auth-form';
import { EmailSignIn } from './email-sign-in';
import { SignInOptions } from './sign-in-options';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('shows email sign-in when the server enables it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ email: true })),
  );
  render(
    <EmailSignIn apiOrigin="http://127.0.0.1:4000" returnTo="/walls/example" />,
  );
  expect(
    (
      await screen.findByRole('link', { name: 'Continue with email' })
    ).getAttribute('href'),
  ).toBe('/auth/email?returnTo=%2Fwalls%2Fexample');
});
it('keeps new methods hidden on failure or non-boolean availability', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ email: 'true' }));
  vi.stubGlobal('fetch', fetchMock);
  render(<EmailSignIn apiOrigin="http://127.0.0.1:4000" returnTo="/me" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole('link')).toBeNull();
});
it('preserves the current destination in the shared sign-in options', async () => {
  const returnTo = '/autograph/create?wall=wall-id';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ email: true, yandex: true })),
  );
  render(
    <SignInOptions apiOrigin="http://127.0.0.1:4000" returnTo={returnTo} />,
  );

  expect(
    (
      await screen.findByRole('link', { name: 'Continue with email' })
    ).getAttribute('href'),
  ).toBe(`/auth/email?returnTo=${encodeURIComponent(returnTo)}`);
  expect(
    screen
      .getByRole('link', { name: 'Продолжить через Яндекс ID' })
      .getAttribute('href'),
  ).toBe(
    `http://127.0.0.1:4000/auth/yandex/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  expect(
    screen.queryByRole('link', { name: /Google|Telegram|VK/i }),
  ).toBeNull();
});
it('reads a confirmation token once in StrictMode, removes it from the URL, and consumes it only on password submission', async () => {
  const token = 'a'.repeat(43);
  window.history.replaceState(null, '', `/auth/email/confirm#token=${token}`);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StrictMode>
      <EmailAuthForm apiOrigin="http://127.0.0.1:4000" confirm />
    </StrictMode>,
  );
  expect(window.location.hash).toBe('');
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a sufficiently long password' },
  });
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: 'a sufficiently long password' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Save password' }).closest('form')!,
  );
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Your password is saved. Sign in with your email and password.',
  );
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    'http://127.0.0.1:4000/auth/email/confirm',
  );
  expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
    token,
    password: 'a sufficiently long password',
  });
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'include',
    cache: 'no-store',
    method: 'POST',
  });
  expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
});
it('rejects mismatched passwords locally and gives a generic expired-link message', async () => {
  window.history.replaceState(
    null,
    '',
    '/auth/email/confirm#token=' + 'a'.repeat(43),
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 400 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<EmailAuthForm apiOrigin="http://127.0.0.1:4000" confirm />);
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a sufficiently long password' },
  });
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: 'different long password' },
  });
  const form = screen
    .getByRole('button', { name: 'Save password' })
    .closest('form')!;
  fireEvent.submit(form);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match.');
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: 'a sufficiently long password' },
  });
  fireEvent.submit(form);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'This link is invalid or has expired. Request a new email.',
  );
  expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
  expect(screen.getByLabelText('Repeat password')).toHaveProperty('value', '');
});
it('asks for ownership of the email before password setup and handles rate limiting', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 429 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<EmailAuthForm apiOrigin="http://127.0.0.1:4000" />);
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(screen.queryByLabelText('Password')).toBeNull();
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'test@example.test' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Send email' }).closest('form')!,
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Too many attempts. Please try again later.',
  );
  expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
    email: 'test@example.test',
  });
});

it('clears a stalled login and lets the user explicitly request a reset', async () => {
  let resolveLogin!: (value: Response) => void;
  const fetchMock = vi.fn().mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<EmailAuthForm apiOrigin="http://127.0.0.1:4000" />);
  const password = screen.getByLabelText('Password');
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'test@example.test' },
  });
  fireEvent.change(password, {
    target: { value: 'a sufficiently long password' },
  });
  const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')!;
  const forgot = screen.getByRole('button', { name: 'Forgot password?' });

  vi.useFakeTimers();
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(forgot.hasAttribute('disabled')).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  vi.useRealTimers();
  expect(screen.getByRole('alert').textContent).toBe(
    'Could not complete the request. Please try again.',
  );
  expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true);
  expect(password).toHaveProperty('value', '');
  expect(forgot.hasAttribute('disabled')).toBe(false);

  fireEvent.click(forgot);
  await act(async () => resolveLogin(new Response(null, { status: 401 })));
  expect(screen.getByRole('heading', { name: 'Reset password' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['timeout', 'server error'])(
  'recovers from an unconfirmed password change after %s without replay',
  async (failure) => {
    window.history.replaceState(
      null,
      '',
      '/auth/email/confirm#token=' + 'a'.repeat(43),
    );
    const fetchMock = vi.fn();
    if (failure === 'timeout')
      fetchMock.mockReturnValueOnce(new Promise(() => {}));
    else fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<EmailAuthForm apiOrigin="http://127.0.0.1:4000" confirm />);
    const password = screen.getByLabelText('Password');
    const repeatPassword = screen.getByLabelText('Repeat password');
    fireEvent.change(password, {
      target: { value: 'a sufficiently long password' },
    });
    fireEvent.change(repeatPassword, {
      target: { value: 'a sufficiently long password' },
    });
    const form = screen
      .getByRole('button', { name: 'Save password' })
      .closest('form')!;

    if (failure === 'timeout') vi.useFakeTimers();
    fireEvent.submit(form);
    if (failure === 'timeout') {
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      vi.useRealTimers();
    }
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not confirm the password change. Try signing in with your new password or request a new reset email.',
    );
    expect(
      screen.getByRole('heading', { name: 'Sign in with email' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Forgot password?' })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
    expect(repeatPassword).toHaveProperty('value', '');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
