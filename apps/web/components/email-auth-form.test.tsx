// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EmailAuthForm } from './email-auth-form';
import { EmailSignIn } from './email-sign-in';
afterEach(() => {
  cleanup();
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
