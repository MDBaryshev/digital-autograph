'use client';
import {
  paymentOrderReferenceSchema,
  paymentOrderStatusSchema,
  type PaymentOrderStatus,
} from '@digital-autograph/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import styles from './payment-return.module.css';
const messages: Record<PaymentOrderStatus['status'], string> = {
  created: 'Payment is being prepared.',
  provider_pending: 'Payment is pending.',
  unknown: 'Payment status is being checked. Do not start another payment.',
  succeeded: 'Payment received. Placement is not confirmed yet.',
  canceled: 'Payment was canceled.',
  paid_but_not_fulfilled:
    'Payment received, but placement could not be completed. Manual review is required.',
  fulfilled: 'Your placement is complete.',
};
type View = {
  message: string;
  busy: boolean;
  canRefreshProvider: boolean;
  signIn: boolean;
};
const checking: View = {
  message: 'Checking payment…',
  busy: true,
  canRefreshProvider: false,
  signIn: false,
};
export function PaymentReturn({
  apiOrigin,
  orderId,
}: {
  apiOrigin: string;
  orderId: string;
}) {
  const { t } = useLocale();
  const reference = paymentOrderReferenceSchema.safeParse(orderId);
  if (!reference.success)
    return (
      <section>
        <p role="status">{t('Invalid order reference.')}</p>
        <HistoryLink />
      </section>
    );
  // A new identity gets a new state machine before effects run, so it cannot
  // inherit a prior order's success message or in-flight operation.
  return (
    <PaymentStatus
      key={JSON.stringify([apiOrigin, reference.data])}
      apiOrigin={apiOrigin}
      orderId={reference.data}
    />
  );
}
function HistoryLink() {
  const { t } = useLocale();
  return (
    <p>
      <a href="/me/placements">{t('View your placement history')}</a>
    </p>
  );
}
function PaymentStatus({
  apiOrigin,
  orderId,
}: {
  apiOrigin: string;
  orderId: string;
}) {
  const { t } = useLocale();
  const [view, setView] = useState<View>(checking);
  const active = useRef<AbortController | null>(null);
  const check = useCallback(
    async (method: 'GET' | 'POST') => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      const timer = window.setTimeout(() => controller.abort(), 15_000);
      setView(checking);
      const failed = (message: string, signIn = false) => {
        if (active.current === controller)
          setView({ message, busy: false, canRefreshProvider: false, signIn });
      };
      try {
        const response = await fetch(
          `${apiOrigin}/payments/orders/${orderId}${method === 'POST' ? '/refresh' : ''}`,
          {
            method,
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            ...(method === 'POST'
              ? { headers: { 'Content-Type': 'application/json' }, body: '{}' }
              : {}),
          },
        );
        if (active.current !== controller || controller.signal.aborted) return;
        if (response.status === 401) {
          failed('Sign in to view your payment.', true);
          return;
        }
        if (response.status === 403 || response.status === 404) {
          failed('Payment is unavailable for this account.');
          return;
        }
        if (!response.ok) {
          failed('Unable to check this payment. Try refreshing its status.');
          return;
        }
        const parsed = paymentOrderStatusSchema.safeParse(
          await response.json(),
        );
        if (active.current !== controller || controller.signal.aborted) return;
        if (!parsed.success || parsed.data.id !== orderId) {
          failed(
            'Unable to confirm payment status. Check its saved status before retrying.',
          );
          return;
        }
        setView({
          message: messages[parsed.data.status],
          busy: false,
          canRefreshProvider: true,
          signIn: false,
        });
      } catch {
        failed(
          'Unable to check payment status. Check your connection and retry.',
        );
      } finally {
        window.clearTimeout(timer);
        if (active.current === controller) {
          active.current = null;
          setView((previous) => ({ ...previous, busy: false }));
        }
      }
    },
    [apiOrigin, orderId],
  );
  useEffect(() => {
    void check('GET');
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [check]);
  return (
    <section>
      <p role="status">{t(view.message)}</p>
      {view.signIn && (
        <p>
          <a href="/me">{t('Sign in to continue')}</a>
        </p>
      )}
      <button
        className={styles.checkButton}
        type="button"
        disabled={view.busy}
        onClick={() => void check(view.canRefreshProvider ? 'POST' : 'GET')}
      >
        {t(
          view.canRefreshProvider || view.busy
            ? 'Refresh payment status'
            : 'Check saved payment status',
        )}
      </button>
      <HistoryLink />
    </section>
  );
}
