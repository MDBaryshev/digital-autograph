// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileModerationWorkspace } from './profile-moderation-workspace';

const item = {
  id: 'profile-1',
  kind: 'profile',
  version: 1,
  createdAt: '2026-09-27T00:00:00Z',
};
const preview = {
  ...item,
  status: 'pending',
  displayName: 'Sample',
  slug: 'example',
  title: null,
  description: null,
  avatarDataUrl: null,
  coverDataUrl: null,
  reasonCode: null,
};

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('profile moderation workspace', () => {
  it.each(['fetch', 'response body'])(
    'requires a fresh queue after a stalled %s',
    async (stage) => {
      let recoverDecision!: (value: unknown) => void;
      const pendingDecision = new Promise((resolve) => {
        recoverDecision = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response({ items: [item], nextCursor: null }))
        .mockResolvedValueOnce(response(preview))
        .mockReturnValueOnce(
          stage === 'fetch'
            ? pendingDecision
            : Promise.resolve({ ok: true, json: () => pendingDecision }),
        )
        .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
      vi.stubGlobal('fetch', fetchMock);
      render(<ProfileModerationWorkspace apiOrigin="http://api.test" />);

      fireEvent.click(
        await screen.findByRole('button', { name: /Public profile ·/ }),
      );
      const approve = await screen.findByRole('button', { name: 'Approve' });
      const refresh = screen.getByRole('button', { name: 'Refresh queue' });
      vi.useFakeTimers();
      fireEvent.click(approve);
      fireEvent.click(approve);
      expect(approve.hasAttribute('disabled')).toBe(true);
      expect(refresh.hasAttribute('disabled')).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      vi.useRealTimers();
      expect(screen.getByRole('alert').textContent).toBe(
        'Review could not be confirmed. Refresh the queue before retrying.',
      );
      expect(fetchMock.mock.calls[2]?.[1].signal.aborted).toBe(true);
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(refresh.hasAttribute('disabled')).toBe(false);

      const decision = { id: item.id, status: 'approved' };
      await act(async () =>
        recoverDecision(stage === 'fetch' ? response(decision) : decision),
      );
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(3);

      fireEvent.click(refresh);
      await screen.findByText('No submissions in this page.');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'GET' });
    },
  );
});
