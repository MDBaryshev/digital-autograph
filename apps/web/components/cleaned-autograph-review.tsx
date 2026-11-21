'use client';
import { useLocale } from './locale-provider';

import { useEffect, useRef, useState } from 'react';
import { AutographApiError } from '../lib/autograph-api';
import {
  FirstUseActionNotice,
  needsFirstUseConfirmation,
} from './first-use-action-notice';
import styles from './canvas-create-screen.module.css';
import { StudioSteps } from './studio-steps';

type Preview = { assetId: string; url: string; expiresAt: string };
type ReviewApi = {
  approve(
    id: string,
    reviewedAssetId: string,
    signal: AbortSignal,
  ): Promise<{
    status: 'awaiting_moderation';
    approvedAt: string;
  }>;
  preview(id: string, signal: AbortSignal): Promise<Preview>;
};

type ApprovalState =
  | { kind: 'preview' }
  | { kind: 'approving' }
  | { kind: 'approval_error'; message: string; legalRequired?: boolean }
  | { kind: 'status_changed' }
  | { kind: 'submitted_for_moderation'; approvedAt: string };

async function reviewRequest<T>(
  controller: AbortController,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => rejectAbort(new Error('REVIEW_REQUEST_ABORTED'));
  controller.signal.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    if (controller.signal.aborted) {
      cancel();
      return await aborted;
    }
    return await Promise.race([work(controller.signal), aborted]);
  } finally {
    window.clearTimeout(timer);
    controller.signal.removeEventListener('abort', cancel);
  }
}

function approvalError(error: unknown): string {
  if (error instanceof AutographApiError) {
    if (error.code === 'REVIEWED_ASSET_MISMATCH') {
      return 'The cleaned version changed. Refresh the preview before approving.';
    }
    if (error.status === 401)
      return 'Your session expired. Sign in again to retry.';
  }
  return 'Approval could not be confirmed. Retry safely; this will not create a duplicate approval.';
}

export function CleanedAutographReview({
  api,
  autographId,
  initialPreview,
  onStartOver,
  studioPath = '/autograph/create',
  wallId,
}: {
  api: ReviewApi;
  autographId: string;
  initialPreview: Preview;
  onStartOver: () => void;
  studioPath?: string;
  wallId?: string;
}) {
  const { t } = useLocale();

  const [preview, setPreview] = useState(initialPreview);
  const [phase, setPhase] = useState<ApprovalState>({ kind: 'preview' });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      const pending = controller.current;
      controller.current = null;
      pending?.abort();
    },
    [],
  );

  const approve = async () => {
    if (
      controller.current ||
      !imageLoaded ||
      phase.kind === 'submitted_for_moderation'
    )
      return;
    const next = new AbortController();
    controller.current = next;
    setPhase({ kind: 'approving' });
    try {
      const result = await reviewRequest(next, (signal) =>
        api.approve(autographId, preview.assetId, signal),
      );
      if (controller.current === next) {
        setPhase({
          kind: 'submitted_for_moderation',
          approvedAt: result.approvedAt,
        });
      }
    } catch (error) {
      if (controller.current !== next) return;
      if (
        error instanceof AutographApiError &&
        error.code === 'AUTOGRAPH_NOT_AWAITING_APPROVAL'
      ) {
        setPhase({ kind: 'status_changed' });
      } else {
        setPhase({
          kind: 'approval_error',
          message: approvalError(error),
          legalRequired: needsFirstUseConfirmation(error),
        });
      }
    } finally {
      if (controller.current === next) controller.current = null;
    }
  };

  const refresh = async () => {
    if (controller.current) return;
    const next = new AbortController();
    controller.current = next;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await reviewRequest(next, (signal) =>
        api.preview(autographId, signal),
      );
      if (controller.current === next) {
        if (result.url !== preview.url || result.assetId !== preview.assetId)
          setImageLoaded(false);
        setPreview(result);
        if (phase.kind === 'approval_error') setPhase({ kind: 'preview' });
      }
    } catch {
      if (controller.current === next)
        setRefreshError('Could not refresh the private preview. Try again.');
    } finally {
      if (controller.current === next) {
        controller.current = null;
        setRefreshing(false);
      }
    }
  };

  const moderationActions = (
    <div className={styles.actions}>
      <a
        className="primaryLink"
        href={
          wallId
            ? `/me/autographs?wall=${encodeURIComponent(wallId)}`
            : '/me/autographs'
        }
      >
        {t('Check moderation status')}
      </a>
      {wallId && <a href={`/walls/${wallId}`}>{t('Back to the Wall')}</a>}
    </div>
  );

  if (phase.kind === 'status_changed') {
    return (
      <section className={styles.preview} aria-labelledby="preview-heading">
        <div className={styles.status}>
          <div role="alert">
            <h2 id="preview-heading">
              {t('The status of this autograph has changed.')}
            </h2>
          </div>
          {moderationActions}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.preview} aria-labelledby="preview-heading">
      <StudioSteps
        current={phase.kind === 'submitted_for_moderation' ? 2 : 1}
      />
      <h2 id="preview-heading">{t('Your cleaned preview')}</h2>
      <p>
        {t(
          'This cleaned version is private. Review it before you submit it for moderation.',
        )}
      </p>
      <img
        key={`${preview.assetId}:${preview.url}`}
        src={preview.url}
        alt={t('Cleaned digital autograph preview')}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setImageLoaded(true);
          setRefreshError(null);
        }}
        onError={() => {
          setImageLoaded(false);
          setRefreshError(
            'Preview could not be loaded. Refresh it before approving.',
          );
        }}
      />
      {refreshError && <p role="alert">{t(refreshError)}</p>}
      {phase.kind === 'submitted_for_moderation' ? (
        <div className={styles.status}>
          <div role="status">
            <h3>{t('Submitted for moderation')}</h3>
            <p>
              {t(
                'Follow the decision in My autographs. You can place this autograph once it is approved.',
              )}
            </p>
          </div>
          {moderationActions}
        </div>
      ) : (
        <div className={styles.approval}>
          <p>
            {t(
              'I approve this cleaned version of my digital autograph and submit it for moderation.',
            )}
          </p>
          <p>
            {t(
              'It is not public yet. It may become public after later moderation and product actions. Do not use a bank or legal signature.',
            )}
          </p>
          {phase.kind === 'approval_error' && (
            <div role="alert">
              {phase.legalRequired ? (
                <FirstUseActionNotice returnTo={studioPath} />
              ) : (
                <p>{t(phase.message)}</p>
              )}
            </div>
          )}
          <button
            className={styles.primary}
            type="button"
            onClick={approve}
            disabled={!imageLoaded || refreshing || phase.kind === 'approving'}
          >
            {phase.kind === 'approving'
              ? t('Submitting approval…')
              : phase.kind === 'approval_error'
                ? t('Retry approval')
                : t('Approve and submit for moderation')}
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || phase.kind === 'approving'}
        >
          {refreshing ? t('Refreshing preview…') : t('Refresh private preview')}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          disabled={refreshing || phase.kind === 'approving'}
        >
          {t('Start a new autograph')}
        </button>
      </div>
    </section>
  );
}
