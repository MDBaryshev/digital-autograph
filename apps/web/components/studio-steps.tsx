'use client';

import { useLocale } from './locale-provider';
import { Icon } from './ui-icon';
import styles from './canvas-create-screen.module.css';

const steps = ['Create', 'Private preview', 'Moderation'] as const;

export function StudioSteps({ current }: { current: 0 | 1 | 2 }) {
  const { t } = useLocale();
  return (
    <ol className={styles.steps} role="list" aria-label={t('Studio progress')}>
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          data-complete={index < current ? '' : undefined}
        >
          <span aria-hidden="true">
            {index < current ? <Icon name="check" size={15} /> : index + 1}
          </span>
          {t(label)}
        </li>
      ))}
    </ol>
  );
}
