import { useId, type ReactNode } from 'react';
import {
  wallCubeFinish,
  wallDesignPlaceKeys,
  type WallCubeFinish,
  type WallDesign,
  type WallDesignPlaceKey,
} from '@digital-autograph/domain';
import { CubePreview } from './autograph-cube';
import { useLocale } from './locale-provider';
import { SignatureArt } from './signature-art';
import { WallCubeMaterialSelect } from './wall-cube-materials';
import { wallPodiumPlace } from '../lib/wall-podium';
import { wallDesignPresentation } from '../lib/wall-design-presentation';
import wall from '../app/walls/[id]/page.module.css';
import styles from './wall-design-studio.module.css';

export function WallDesignPreview({
  design,
  owner,
  renderPlace,
  onChange,
  materialsDisabled,
}: {
  design: WallDesign;
  owner: string;
  renderPlace?: (place: number) => ReactNode;
  onChange: (design: WallDesign) => void;
  materialsDisabled: boolean;
}) {
  const { t } = useLocale();
  const slotsId = useId();
  const action = design.style.actionLabel || t('Find a place');

  function setPlaceFinish(key: WallDesignPlaceKey, finish?: WallCubeFinish) {
    const placeFinishes = { ...design.style.placeFinishes };
    if (finish) placeFinishes[key] = finish;
    else delete placeFinishes[key];
    onChange({ ...design, style: { ...design.style, placeFinishes } });
  }

  return (
    <section className={styles.preview} aria-labelledby="wall-design-preview">
      <h2 id="wall-design-preview">{t('Wall preview')}</h2>
      <div
        className={`${wall.page} ${styles.mock}`}
        {...wallDesignPresentation(design.style)}
      >
        <header className={wall.header}>
          {design.coverDataUrl && (
            <img
              src={design.coverDataUrl}
              className={wall.designCover}
              alt=""
            />
          )}
          <div className={wall.wallIdentity}>
            {design.avatarDataUrl && (
              <img
                className={wall.ownerAvatar}
                src={design.avatarDataUrl}
                alt=""
              />
            )}
            {design.style.event && (
              <p className={wall.designEvent}>{design.style.event}</p>
            )}
            <h3 className={wall.designTitle}>
              {design.title ||
                (owner ? t("{name}'s Wall", { name: owner }) : t('Wall'))}
            </h3>
            {design.description && <p>{design.description}</p>}
            {renderPlace ? (
              <a className={wall.designAction} href={`#${slotsId}`}>
                {action}
              </a>
            ) : (
              <span className={`${wall.designAction} ${styles.previewAction}`}>
                {action}
              </span>
            )}
          </div>
        </header>
        <ol
          id={slotsId}
          className={`${wall.grid} ${styles.previewSlots}`}
          aria-label={t('Places')}
        >
          {wallDesignPlaceKeys.map((key, index) => (
            <li
              key={key}
              className={wall.slot}
              data-podium={wallPodiumPlace(index + 1, design.style.podium)?.key}
            >
              {renderPlace ? (
                renderPlace(index + 1)
              ) : (
                <CubePreview
                  details={{
                    place: index + 1,
                    podium: design.style.podium,
                    finish: wallCubeFinish(design.style, index + 1),
                    empty: index > 2,
                    artwork:
                      index <= 2 ? (
                        <SignatureArt variant={index} />
                      ) : (
                        <span>+</span>
                      ),
                  }}
                />
              )}
              <WallCubeMaterialSelect
                label={t('Material for cube {place}', { place: key })}
                className={styles.placeMaterial}
                value={design.style.placeFinishes?.[key]}
                defaultFinish={design.style.finish ?? 'metallic'}
                disabled={materialsDisabled}
                onChange={(finish) => setPlaceFinish(key, finish)}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
