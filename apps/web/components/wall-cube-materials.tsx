'use client';

import { useState } from 'react';
import {
  isWallGlassFinish,
  wallCubeFinish,
  wallDesignFinishes,
  wallDesignPlaceKeys,
  type WallCubeFinish,
  type WallDesignPlaceKey,
  type WallDesignStyle,
} from '@digital-autograph/domain';
import { useLocale } from './locale-provider';
import cube from './autograph-cube.module.css';
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

type Target = 'wall' | WallDesignPlaceKey;

export function WallCubeMaterials({
  value,
  onChange,
}: {
  value: WallDesignStyle;
  onChange: (next: Partial<WallDesignStyle>) => void;
}) {
  const { t } = useLocale();
  const [target, setTarget] = useState<Target>('wall');
  const override =
    target === 'wall' ? undefined : value.placeFinishes?.[target];
  const active =
    target === 'wall'
      ? (value.finish ?? 'metallic')
      : wallCubeFinish(value, Number(target));

  function choose(finish: WallCubeFinish) {
    if (target === 'wall') onChange({ finish });
    else
      onChange({ placeFinishes: { ...value.placeFinishes, [target]: finish } });
  }

  function useDefault() {
    if (target === 'wall') return;
    const placeFinishes = { ...value.placeFinishes };
    delete placeFinishes[target];
    onChange({ placeFinishes });
  }

  return (
    <section className={styles.group}>
      <h2>{t('Cube materials')}</h2>
      <div className={styles.materialTarget}>
        <label>
          {t('Apply material to')}
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as Target)}
          >
            <option value="wall">{t('Wall default')}</option>
            {wallDesignPlaceKeys.map((place) => (
              <option key={place} value={place}>
                {t('Place {place}', { place })}
                {value.placeFinishes?.[place] ? ' •' : ''}
              </option>
            ))}
          </select>
        </label>
        {override && (
          <button type="button" onClick={useDefault}>
            {t('Use wall default')}
          </button>
        )}
      </div>
      <div className={styles.materials}>
        {wallDesignFinishes.map((finish) => (
          <button
            key={finish}
            type="button"
            aria-pressed={active === finish}
            onClick={() => choose(finish)}
          >
            <span className={cube.finishSample} aria-hidden="true">
              <span
                className={cube.finishSwatch}
                data-cube-finish={finish}
                data-glass={isWallGlassFinish(finish) ? '' : undefined}
              />
            </span>
            {t(finishLabels[finish])}
          </button>
        ))}
      </div>
    </section>
  );
}
