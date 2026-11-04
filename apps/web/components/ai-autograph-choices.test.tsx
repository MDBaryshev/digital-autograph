// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AiAutographChoices } from './ai-autograph-choices';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows three choices and hands only the explicitly selected PNG to the existing upload flow', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 202 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ state: 'completed', images: [png, png, png] }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const choose = vi.fn();
  render(
    <AiAutographChoices
      apiOrigin="http://api.test"
      disabled={false}
      onChoose={choose}
    />,
  );
  fireEvent.change(screen.getByLabelText('Your nickname'), {
    target: { value: 'demo-name' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 variants' }));
  const variant = await screen.findByRole(
    'img',
    { name: 'Autograph variant 2' },
    { timeout: 3500 },
  );
  const button = variant.closest('button')!;
  expect(choose).not.toHaveBeenCalled();
  expect(screen.getAllByRole('img')).toHaveLength(3);
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledOnce();
  expect(choose.mock.calls[0]![0].type).toBe('image/png');
  expect(choose.mock.calls[0]![0].size).toBe(8);
  expect(fetcher).toHaveBeenCalledTimes(2); // no upload, approval or placement on selection
});
it('offers an understandable fallback when the provider capability is unavailable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
  );
  render(
    <AiAutographChoices
      apiOrigin="http://api.test"
      disabled={false}
      onChoose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Your nickname'), {
    target: { value: 'demo' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 variants' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'draw your own autograph',
  );
});
