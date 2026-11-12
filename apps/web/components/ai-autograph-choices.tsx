'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';

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
  const request = useRef<{ nickname: string; id: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    if (controller.current || disabled) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    const name = nickname.trim();
    if (request.current?.nickname !== name)
      request.current = { nickname: name, id: crypto.randomUUID() };
    const id = request.current!.id;
    try {
      const response = await fetch(apiOrigin + '/ai/autographs/suggestions', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal: c.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: name, requestId: id }),
      });
      // Pending/failed admission is deliberately non-retryable at the provider.
      // Resume owner-scoped polling of that UUID after an interrupted response.
      const resumeExisting =
        response.status === 409 &&
        (await response.json().catch(() => null))?.error?.code ===
          'AI_REQUEST_UNAVAILABLE';
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
        const result = await fetch(
          apiOrigin + '/ai/autographs/suggestions/' + id,
          { credentials: 'include', cache: 'no-store', signal: c.signal },
        );
        if (!result.ok)
          throw Error('Could not load variants. Retry with the same nickname.');
        const data = await result.json();
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
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : 'Generation is unavailable.');
    } finally {
      if (!c.signal.aborted) setBusy(false);
      controller.current = null;
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
