'use client';

import {
  wallDesignFinishes,
  type WallCubeFinish,
  type WallDesignPodium,
  type WallDesignStyle,
} from '@digital-autograph/domain';
import { useLocale } from './locale-provider';
import styles from './wall-design-studio.module.css';

const finishLabels = {
  metallic: 'Polished metal',
  brushed: 'Brushed metal',
  glass: 'Clear glass',
  'satin-glass': 'Satin glass',
  'smoked-glass': 'Smoked glass',
  matte: 'Matte',
  enamel: 'Glazed enamel',
  stone: 'Terrazzo',
  weave: 'Carbon weave',
} satisfies Record<WallCubeFinish, string>;

export function WallCubeMaterialSelect({
  label,
  value,
  defaultFinish,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value?: WallCubeFinish;
  defaultFinish?: WallCubeFinish;
  onChange: (finish: WallCubeFinish | undefined) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useLocale();
  const material = value ?? defaultFinish;
  return (
    <select
      aria-label={label}
      className={className}
      value={value ?? ''}
      disabled={disabled}
      title={material ? t(finishLabels[material]) : undefined}
      onChange={(event) =>
        onChange(
          (event.currentTarget.value as WallCubeFinish | '') || undefined,
        )
      }
    >
      {defaultFinish && <option value="">{t('Shared')}</option>}
      {wallDesignFinishes.map((finish) => (
        <option key={finish} value={finish}>
          {t(finishLabels[finish])}
        </option>
      ))}
    </select>
  );
}

export function WallCubeMaterials({
  value,
  onChange,
}: {
  value: WallDesignStyle;
  onChange: (next: Partial<WallDesignStyle>) => void;
}) {
  const { t } = useLocale();
  const label = t('Shared cube material');
  return (
    <section className={styles.group}>
      <h2>{t('Cube materials')}</h2>
      <div className={styles.options}>
        <label>
          {label}
          <WallCubeMaterialSelect
            label={label}
            value={value.finish ?? 'metallic'}
            onChange={(finish) => onChange({ finish })}
          />
        </label>
        <label>
          {t('Top three style')}
          <select
            value={value.podium ?? 'classic'}
            onChange={(event) =>
              onChange({ podium: event.target.value as WallDesignPodium })
            }
          >
            <option value="classic">{t('Classic podium')}</option>
            <option value="jewels">{t('Diamond podium')}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
