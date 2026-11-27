'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';

const timeoutMessage =
  'Generation response timed out. Retry with the same nickname or draw your own autograph.';

// Race both headers and body reads: abort alone need not settle a stalled reader.
async function boundedRead<T>(
  parent: AbortSignal,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const child = new AbortController();
  let cancel!: () => void;
  let timer: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      child.abort(parent.reason);
      reject(parent.reason);
    };
    parent.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const error = Error(timeoutMessage);
      child.abort(error);
      reject(error);
    }, 10_000);
    if (parent.aborted) cancel();
  });
  try {
    if (parent.aborted) throw parent.reason;
    return await Promise.race([read(child.signal), interrupted]);
  } finally {
    clearTimeout(timer!);
    parent.removeEventListener('abort', cancel);
    child.abort();
  }
}

export function AiAutographChoices({
  apiOrigin,
  disabled,
  onChoose,
}: {
  apiOrigin: string;
  disabled: boolean;
  onChoose: (blob: Blob) => void;
}) {
  const { t } = useLocale();
  const [nickname, setNickname] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const request = useRef<{
    nickname: string;
    origin: string;
    id: string;
  } | null>(null);
  useEffect(() => {
    setBusy(false);
    setError('');
    setImages([]);
    setSelected(null);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [apiOrigin, disabled]);
  const generate = async () => {
    if (controller.current || disabled) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    setImages([]);
    setSelected(null);
    const name = nickname.trim();
    if (
      request.current?.nickname !== name ||
      request.current?.origin !== apiOrigin
    )
      request.current = {
        nickname: name,
        origin: apiOrigin,
        id: crypto.randomUUID(),
      };
    const id = request.current!.id;
    const overallTimeout = Error(timeoutMessage);
    const overallTimer = setTimeout(() => c.abort(overallTimeout), 210_000);
    try {
      const { response, resumeExisting } = await boundedRead(
        c.signal,
        async (signal) => {
          const response = await fetch(
            apiOrigin + '/ai/autographs/suggestions',
            {
              method: 'POST',
              credentials: 'include',
              cache: 'no-store',
              signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nickname: name, requestId: id }),
            },
          );
          // Pending/failed admission is deliberately non-retryable at the provider.
          // Resume owner-scoped polling of that UUID after an interrupted response.
          const resumeExisting =
            response.status === 409 &&
            (await response.json().catch(() => null))?.error?.code ===
              'AI_REQUEST_UNAVAILABLE';
          return { response, resumeExisting };
        },
      );
      if (!response.ok && !resumeExisting)
        throw Error(
          response.status === 401
            ? 'Sign in first.'
            : response.status === 429
              ? 'Generation limit reached. Draw your own autograph or try tomorrow.'
              : response.status === 503
                ? 'Generation is unavailable. You can draw your own autograph.'
                : 'Could not start generation. Check the account requirements and retry.',
        );
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            c.signal.removeEventListener('abort', abort);
            resolve();
          }, 2000);
          const abort = () => {
            clearTimeout(timer);
            reject(Error('cancelled'));
          };
          c.signal.addEventListener('abort', abort, { once: true });
          if (c.signal.aborted) abort();
        });
        const data = await boundedRead(c.signal, async (signal) => {
          const result = await fetch(
            apiOrigin + '/ai/autographs/suggestions/' + id,
            { credentials: 'include', cache: 'no-store', signal },
          );
          if (!result.ok)
            throw Error(
              'Could not load variants. Retry with the same nickname.',
            );
          return result.json();
        });
        if (c.signal.aborted || controller.current !== c) return;
        if (data.state === 'failed')
          throw Error(
            'Generation failed. Draw your autograph or change your nickname for a new attempt.',
          );
        if (data.state === 'completed') {
          if (
            !Array.isArray(data.images) ||
            data.images.length !== 3 ||
            data.images.some(
              (s: unknown) =>
                typeof s !== 'string' ||
                !s.startsWith('data:image/png;base64,'),
            )
          )
            throw Error('Variants are unavailable.');
          setImages(data.images);
          setSelected(null);
          return;
        }
      }
      throw Error(
        'Generation has not finished. Retry with the same nickname to avoid another API charge.',
      );
    } catch (e) {
      if (
        controller.current === c &&
        (!c.signal.aborted || c.signal.reason === overallTimeout)
      )
        setError(
          c.signal.reason === overallTimeout
            ? timeoutMessage
            : e instanceof Error
              ? e.message
              : 'Generation is unavailable.',
        );
    } finally {
      clearTimeout(overallTimer);
      if (controller.current === c) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  return (
    <section aria-label={t('AI autograph suggestions')}>
      <p>
        {t(
          'Enter your nickname to generate three decorative autographs. Your nickname is sent to OpenRouter and the selected model. Never use a bank or legal signature.',
        )}
      </p>
      <label>
        {t('Your nickname')}
        <input
          maxLength={80}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={busy || disabled}
        />
      </label>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || disabled || !nickname.trim()}
      >
        {busy ? t('Generating three variants…') : t('Suggest 3 variants')}
      </button>
      {busy && (
        <p role="status">
          {t(
            'This can take up to three minutes. Choose a variant before uploading.',
          )}
        </p>
      )}
      {error && <p role="alert">{t(error)}</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))',
          gap: '1rem',
        }}
      >
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || busy}
            aria-pressed={selected === i}
            onClick={() => {
              const bytes = Uint8Array.from(atob(src.split(',')[1]!), (c) =>
                c.charCodeAt(0),
              );
              onChoose(new Blob([bytes], { type: 'image/png' }));
              setSelected(i);
            }}
          >
            <img
              src={src}
              alt={t('Autograph variant {number}', { number: i + 1 })}
              style={{ width: '100%', background: '#fff' }}
            />
            {t('Choose variant {number}', { number: i + 1 })}
          </button>
        ))}
      </div>
      {selected !== null && (
        <p role="status">
          {t(
            'Variant {number} selected. Create a private preview to check the processed result.',
            { number: selected + 1 },
          )}
        </p>
      )}
    </section>
  );
}
