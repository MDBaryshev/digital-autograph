// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { WallInvite } from './wall-invite';
const id = '00000000-0000-4000-8000-000000000001';
const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const oldShare = Object.getOwnPropertyDescriptor(navigator, 'share');
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [key, old] of [
    ['clipboard', oldClipboard],
    ['share', oldShare],
  ] as const) {
    if (old) Object.defineProperty(navigator, key, old);
    else Reflect.deleteProperty(navigator, key);
  }
});
const setup = (
  copy = vi.fn().mockResolvedValue(undefined),
  share?: ReturnType<typeof vi.fn>,
) => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copy },
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: share,
  });
  render(
    <WallInvite
      wallId={id}
      title="My Wall"
      apiOrigin="https://api.example.test"
    />,
  );
  return copy;
};
it('copies the public Wall URL without creating a placement share or exposing private data', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  const copy = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Copy Wall link' }));
  await screen.findByText('Link copied.');
  expect(copy).toHaveBeenCalledWith(location.origin + '/walls/' + id);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole('link', { name: 'Open invitation card' })
      .getAttribute('href'),
  ).toBe('https://api.example.test/walls/' + id + '/invite-card?locale=en');
});
it('keeps native-share cancellation quiet and falls back to manual selection when copying is denied', async () => {
  const copy = vi.fn().mockRejectedValue(Error('clipboard unavailable'));
  const share = vi
    .fn()
    .mockRejectedValue(new DOMException('cancel', 'AbortError'));
  setup(copy, share);
  fireEvent.click(screen.getByRole('button', { name: 'Share invitation' }));
  await waitFor(() => expect(share).toHaveBeenCalledOnce());
  expect(copy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Copy Wall link' }));
  await screen.findByText('Copy the link from the field below.');
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Wall invitation link' }),
  );
});
