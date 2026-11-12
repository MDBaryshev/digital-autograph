'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  autographIdParams,
  moderationRejectionReasons,
} from '@digital-autograph/contracts';
import { useLocale } from './locale-provider';

type Reason = (typeof moderationRejectionReasons)[number];
const reasonLabels: Record<Reason, string> = {
  SEXUAL_CONTENT: 'Explicit sexual content',
  HATE_OR_EXTREMISM: 'Hate or extremist content',
  THREATS_OR_VIOLENCE: 'Threats or graphic violence',
  PERSONAL_DATA: 'Sensitive personal data',
  IMPERSONATION_OR_DECEPTIVE: 'Deceptive impersonation',
  ILLEGAL_OR_PROHIBITED: 'Illegal or prohibited content',
  NOT_AN_AUTOGRAPH: 'Not an autograph',
  OTHER_POLICY_VIOLATION: 'Other policy violation',
};
type Detail = { reason: Reason; decidedAt: string };
type State =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; detail: Detail }
  | { kind: 'error'; status: number | null };

function rejectionDetail(value: unknown, expectedId: string): Detail {
  // The owner API also returns original/upload metadata. Retain only these
  // validated moderation fields; never store or render the rest of its payload.
  if (!value || typeof value !== 'object') throw Error();
  const result = value as Record<string, unknown>;
  if (
    result.id !== expectedId ||
    result.status !== 'moderation_rejected' ||
    !result.moderation ||
    typeof result.moderation !== 'object'
  )
    throw Error();
  const decision = result.moderation as Record<string, unknown>;
  if (
    decision.decision !== 'rejected' ||
    typeof decision.reasonCode !== 'string' ||
    !moderationRejectionReasons.includes(decision.reasonCode as Reason) ||
    typeof decision.decidedAt !== 'string'
  )
    throw Error();
  const timestamp = new Date(decision.decidedAt);
  // API Date values serialize as canonical UTC ISO timestamps. This also
  // rejects impossible dates that Date.parse would otherwise normalize.
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !== decision.decidedAt
  )
    throw Error();
  return {
    reason: decision.reasonCode as Reason,
    decidedAt: decision.decidedAt,
  };
}

export function OwnerRejectionDetails(props: {
  apiOrigin: string;
  autographId: string;
}) {
  // A new selection/origin remounts private state immediately, before effects.
  return (
    <RejectionDetails
      key={JSON.stringify([props.apiOrigin, props.autographId])}
      {...props}
    />
  );
}

function RejectionDetails({
  apiOrigin,
  autographId,
}: {
  apiOrigin: string;
  autographId: string;
}) {
  const { t, locale } = useLocale();
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const detailsId = useId();
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!opened) return;
    if (!autographIdParams.safeParse({ id: autographId }).success) {
      setState({ kind: 'error', status: null });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'loading' });
    const current = () =>
      request.current === controller && !controller.signal.aborted;
    const timeout = window.setTimeout(() => {
      if (request.current !== controller) return;
      request.current = null;
      controller.abort();
      setState({ kind: 'error', status: null });
    }, 15_000);
    void (async () => {
      try {
        const response = await fetch(
          `${apiOrigin}/autographs/${encodeURIComponent(autographId)}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!current()) return;
        if (!response.ok) {
          setState({ kind: 'error', status: response.status });
          return;
        }
        const detail = rejectionDetail(await response.json(), autographId);
        if (current()) setState({ kind: 'ready', detail });
      } catch {
        if (current()) setState({ kind: 'error', status: null });
      } finally {
        window.clearTimeout(timeout);
        if (request.current === controller) request.current = null;
      }
    })();
    return () => {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      controller.abort();
    };
  }, [opened, attempt, apiOrigin, autographId]);

  return (
    <>
      <button
        type="button"
        aria-expanded={opened}
        aria-controls={opened ? detailsId : undefined}
        onClick={() => {
          setState({ kind: 'idle' });
          setOpened((previous) => !previous);
        }}
      >
        {t(opened ? 'Close rejection details' : 'View rejection details')}
      </button>
      {opened && (
        <section id={detailsId} aria-label={t('Rejection details')}>
          {state.kind === 'loading' && (
            <p role="status">{t('Loading rejection details…')}</p>
          )}
          {state.kind === 'ready' && (
            <>
              <p>
                {t('Rejection reason')}:{' '}
                <span>{t(reasonLabels[state.detail.reason])}</span>
              </p>
              <p>
                {t('Decision date')}:{' '}
                <time dateTime={state.detail.decidedAt}>
                  {new Date(state.detail.decidedAt).toLocaleString(
                    locale === 'ru' ? 'ru-RU' : 'en-GB',
                  )}
                </time>
              </p>
              <p>
                {t(
                  'This decision is final for this autograph. You can create a new autograph for another review.',
                )}
              </p>
              <a href="/autograph/create">{t('Start a new autograph')}</a>
            </>
          )}
          {state.kind === 'error' && (
            <>
              <p role="alert">
                {t(
                  state.status === 401
                    ? 'Your session expired. Sign in to read rejection details.'
                    : state.status === 403 || state.status === 404
                      ? 'Rejection details are no longer available to this account.'
                      : 'Rejection details could not be loaded. Try again.',
                )}
              </p>
              {state.status === 401 ? (
                <a href="/me">{t('Sign in to continue')}</a>
              ) : (
                state.status !== 403 &&
                state.status !== 404 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!request.current) setAttempt((value) => value + 1);
                    }}
                  >
                    {t('Retry rejection details')}
                  </button>
                )
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
