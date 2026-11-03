// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WallSlot } from './wall-slot';
import { frontendCapabilities } from '../lib/frontend-capabilities';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('highlights only the first three places and labels every remaining place without a crown', () => {
  render(
    <ul>
      {Array.from({ length: 10 }, (_, position) => (
        <WallSlot
          key={position}
          apiOrigin="https://api.example.test"
          slot={{
            id: `slot-${position}`,
            position,
            occupied: false,
            currentPlacement: null,
          }}
        />
      ))}
    </ul>,
  );
  const places = screen.getAllByRole('listitem');
  expect(places).toHaveLength(10);
  expect(screen.getAllByRole('img')).toHaveLength(3);
  for (const [i, label] of [
    'Gold place',
    'Silver place',
    'Bronze place',
  ].entries()) {
    expect(places[i]!.querySelector('svg')?.getAttribute('aria-label')).toBe(
      label,
    );
    expect(places[i]!.getAttribute('data-podium')).toBe(
      ['gold', 'silver', 'bronze'][i],
    );
  }
  for (const [i, place] of places.entries()) {
    expect(place.textContent).toContain(`Slot ${i + 1}`);
    if (i >= 3) {
      expect(place.querySelector('svg')).toBeNull();
      expect(place.getAttribute('data-podium')).toBeNull();
    }
  }
});
it('keeps paid takeover disabled without requests, and retries failed public media', () => {
  const onAction = vi.fn();
  render(
    <ul>
      <WallSlot
        apiOrigin="https://api.example.test"
        onAction={onAction}
        slot={{
          id: 'slot',
          position: 0,
          occupied: true,
          currentPlacement: {
            id: 'placement',
            source: 'free_claim',
            startedAt: '2026-10-02T12:00:00Z',
            mediaPath: '/public/placements/placement/autograph',
          },
        }}
      />
    </ul>,
  );
  expect(frontendCapabilities).toEqual({
    paidTakeover: false,
    creatorDashboard: false,
    notifications: true,
  });
  const paid = screen.getByRole('button', { name: 'Paid takeover' });
  expect(paid).toHaveProperty('disabled', true);
  fireEvent.click(paid);
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.error(
    screen.getByRole('img', { name: 'Digital autograph in slot 1' }),
  );
  expect(screen.getByText('Autograph unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry autograph' }));
  expect(
    screen
      .getByRole('img', { name: 'Digital autograph in slot 1' })
      .getAttribute('src'),
  ).toBe('https://api.example.test/public/placements/placement/autograph');
});

it('offers a retry when SSR media failed before hydration attached its error handler', () => {
  const complete = vi
    .spyOn(HTMLImageElement.prototype, 'complete', 'get')
    .mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
    0,
  );
  const onAction = vi.fn();
  render(
    <ul>
      <WallSlot
        apiOrigin="https://api.example.test"
        onAction={onAction}
        slot={{
          id: 'slot',
          position: 0,
          occupied: true,
          currentPlacement: {
            id: 'placement',
            source: 'free_claim',
            startedAt: '2026-10-02T12:00:00Z',
            mediaPath: '/public/placements/placement/autograph',
          },
        }}
      />
    </ul>,
  );
  expect(screen.getByText('Autograph unavailable')).toBeTruthy();
  complete.mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry autograph' }));
  expect(
    screen
      .getByRole('img', { name: 'Digital autograph in slot 1' })
      .getAttribute('src'),
  ).toBe('https://api.example.test/public/placements/placement/autograph');
  expect(screen.queryByRole('button', { name: 'Claim this slot' })).toBeNull();
  expect(onAction).not.toHaveBeenCalled();
});
