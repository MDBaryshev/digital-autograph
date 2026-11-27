import type { WallDesign, WallDesignStyle } from '@digital-autograph/domain';
import { useLocale } from './locale-provider';
import { WallCubeMaterials } from './wall-cube-materials';
import { WallPalette } from './wall-palette';
import styles from './wall-design-studio.module.css';

const selects = [
  {
    key: 'layout',
    label: 'Place layout',
    options: { podium: 'Podium', gallery: 'Gallery' },
  },
  {
    key: 'frame',
    label: 'Corner style',
    options: { soft: 'Rounded', square: 'Square' },
  },
] as const;

export type DesignImage = 'avatarDataUrl' | 'coverDataUrl';

export function WallDesignFields({
  value,
  update,
  onImage,
}: {
  value: WallDesign;
  update: (value: WallDesign) => void;
  onImage: (kind: DesignImage, file: File) => void;
}) {
  const { t } = useLocale();
  const style = (change: Partial<WallDesignStyle>) =>
    update({ ...value, style: { ...value.style, ...change } });

  return (
    <>
      <WallCubeMaterials value={value.style} onChange={style} />
      <WallPalette value={value.style} onChange={style} />
      <section className={styles.group}>
        <h2>{t('Wall appearance')}</h2>
        <div className={styles.options}>
          {selects.map(({ key, label, options }) => (
            <label key={key}>
              {t(label)}
              <select
                value={value.style[key]}
                onChange={(e) => style({ [key]: e.target.value })}
              >
                {Object.entries(options).map(([option, text]) => (
                  <option key={option} value={option}>
                    {t(text)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {(
          [
            ['coverDataUrl', 'Upload cover', 'Remove cover'],
            ['avatarDataUrl', 'Upload avatar', 'Remove avatar'],
          ] as const
        ).map(([field, upload, remove]) => (
          <div className={styles.upload} key={field}>
            <label>
              {t(upload)}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onImage(field, file);
                }}
              />
            </label>
            {value[field] && (
              <button
                type="button"
                onClick={() => update({ ...value, [field]: null })}
              >
                {t(remove)}
              </button>
            )}
          </div>
        ))}
      </section>
      <section className={styles.group}>
        <h2>{t('Wall content')}</h2>
        <label>
          {t('Wall name')}
          <input
            value={value.title}
            maxLength={100}
            onChange={(e) => update({ ...value, title: e.target.value })}
          />
        </label>
        <label>
          {t('Event or collection')}
          <input
            value={value.style.event}
            maxLength={80}
            onChange={(e) => style({ event: e.target.value })}
          />
        </label>
        <label>
          {t('Wall description')}
          <textarea
            value={value.description}
            maxLength={500}
            rows={3}
            onChange={(e) => update({ ...value, description: e.target.value })}
          />
        </label>
        <label>
          {t('Placement button label')}
          <input
            value={value.style.actionLabel}
            maxLength={48}
            placeholder={t('Find a place')}
            onChange={(e) => style({ actionLabel: e.target.value })}
          />
        </label>
      </section>
    </>
  );
}
