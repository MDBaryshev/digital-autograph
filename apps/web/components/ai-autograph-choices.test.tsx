// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { AiAutographChoices } from './ai-autograph-choices';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

it('resumes the same pending UUID after an interrupted start without selecting or uploading', async () => {
  vi.useFakeTimers();
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('network interrupted'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'AI_REQUEST_UNAVAILABLE' } }),
        {
          status: 409,
        },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'pending' })))
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
    target: { value: 'demo' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 variants' }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'network interrupted',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 variants' }));
  });
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(screen.getAllByRole('img')).toHaveLength(3);
  expect(choose).not.toHaveBeenCalled();
  const original = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual(original);
  expect(fetcher.mock.calls.slice(2).map(([url]) => url)).toEqual([
    'http://api.test/ai/autographs/suggestions/' + original.requestId,
    'http://api.test/ai/autographs/suggestions/' + original.requestId,
  ]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('reads a previously failed batch without admitting a replacement', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'AI_REQUEST_UNAVAILABLE' } }),
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'failed' })));
  vi.stubGlobal('fetch', fetcher);
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
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 variants' }));
  });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole('alert').textContent).toContain('Generation failed.');
  expect(screen.queryAllByRole('img')).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  JSON.stringify({ error: { code: 'AI_REQUEST_CONFLICT' } }),
  'invalid-json',
  'null',
])(
  'does not poll or dispatch a replacement for another conflict: %s',
  async (body) => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(body, { status: 409 }));
    vi.stubGlobal('fetch', fetcher);
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
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Suggest 3 variants' }),
      );
    });
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not start generation.',
    );
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
