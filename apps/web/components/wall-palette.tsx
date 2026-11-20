'use client';

import { useState } from 'react';
import { wallDesignHex, type WallDesignStyle } from '@digital-autograph/domain';
import { wallDesignPalettes } from '../lib/wall-design-palettes';
import { useLocale } from './locale-provider';
import styles from './wall-design-studio.module.css';

const colorLabels = {
  surface: 'Wall background',
  cover: 'Cover background',
  heading: 'Cover text',
  frame: 'Frames and borders',
  cube: 'Cube front',
  sides: 'Other cube faces',
  ink: 'Autograph ink',
  accent: 'Accent color',
} as const;

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value?: string;
  fallback: string;
  onChange: (hex: string) => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<string | null>(null);
  const color = value ?? fallback;

  return (
    <div className={styles.colorField}>
      <span>{label}</span>
      <div className={styles.colorInputs}>
        <input
          type="color"
          aria-label={label}
          value={color}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value);
          }}
        />
        <input
          type="text"
          aria-label={t('{label}, HEX', { label })}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          placeholder={t('Theme color')}
          value={draft ?? value?.toUpperCase() ?? ''}
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const hex = text.startsWith('#') ? text : '#' + text;
            if (wallDesignHex.test(hex)) onChange(hex.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

export function WallPalette({
  value,
  onChange,
}: {
  value: WallDesignStyle;
  onChange: (next: Partial<WallDesignStyle>) => void;
}) {
  const { t } = useLocale();
  const base =
    wallDesignPalettes.find(({ theme }) => theme === value.theme) ??
    wallDesignPalettes[0]!;
  return (
    <section className={styles.group}>
      <h2>{t('Wall palette')}</h2>
      <p className={styles.paletteHint}>
        {t(
          'Face colors tint the three podium metals. The other cubes take the chosen colors.',
        )}
      </p>
      <div
        className={styles.colorPresets}
        aria-label={t('Ready-made palettes')}
      >
        {wallDesignPalettes.map((preset) => {
          const { accent, ...colors } = preset.colors;
          const active =
            value.theme === preset.theme &&
            value.accent === accent &&
            value.finish === preset.finish &&
            value.pattern === preset.pattern &&
            Object.entries(colors).every(
              ([key, hex]) =>
                value.colors?.[key as keyof typeof colors] === hex,
            );
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange({
                  theme: preset.theme,
                  colors,
                  accent,
                  finish: preset.finish,
                  pattern: preset.pattern,
                })
              }
            >
              <span className={styles.paletteSwatches} aria-hidden="true">
                {[colors.cover, colors.cube, colors.ink, accent].map(
                  (hex, index) => (
                    <span key={index} style={{ backgroundColor: hex }} />
                  ),
                )}
              </span>
              {t(preset.label)}
            </button>
          );
        })}
      </div>
      <div className={styles.colorGrid}>
        {Object.entries(colorLabels).map(([key, label]) => {
          const name = key as keyof typeof colorLabels;
          const appearance = value.colors;
          return (
            <ColorField
              key={name}
              label={t(label)}
              fallback={base.colors[name]}
              value={name === 'accent' ? value.accent : appearance?.[name]}
              onChange={(hex) =>
                onChange(
                  name === 'accent'
                    ? { accent: hex }
                    : { colors: { ...appearance, [name]: hex } },
                )
              }
            />
          );
        })}
      </div>
    </section>
  );
}
