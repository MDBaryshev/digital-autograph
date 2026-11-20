'use client';

import { useRef, useState } from 'react';
import { wallCubeFinish, type WallDesign } from '@digital-autograph/domain';
import { wallCubePaint } from '../lib/wall-design-presentation';
import { appearanceImageFile } from '../lib/appearance-image-file';
import { CubePreview, CubeViewer, type CubeDetails } from './autograph-cube';
import { DemoDrawingDialog, DemoInk, type DemoMark } from './demo-wall-drawing';
import { useLocale } from './locale-provider';
import { SignatureArt } from './signature-art';
import { WallDesignFields, type DesignImage } from './wall-design-fields';
import { WallDesignPreview } from './wall-design-preview';
import wall from '../app/walls/[id]/page.module.css';
import styles from './wall-design-studio.module.css';

export function WallDesignDemo({
  initialDesign,
}: {
  initialDesign: WallDesign;
}) {
  const { t } = useLocale();
  const [design, setDesign] = useState(initialDesign);
  const [mark, setMark] = useState<DemoMark | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [viewing, setViewing] = useState<CubeDetails | null>(null);
  const [imageError, setImageError] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const imageBusy = useRef(false);

  async function addImage(field: DesignImage, file: File) {
    if (imageBusy.current) return;
    imageBusy.current = true;
    setProcessingImage(true);
    setImageError(false);
    try {
      const source = await appearanceImageFile(
        file,
        field === 'avatarDataUrl' ? 'avatar' : 'wall-cover',
      );
      setDesign((current) => ({ ...current, [field]: source }));
    } catch {
      setImageError(true);
    } finally {
      imageBusy.current = false;
      setProcessingImage(false);
    }
  }

  function renderPlace(place: number) {
    const sample = place <= 3;
    const drawn = mark?.place === place;
    const details: CubeDetails = {
      place,
      paint: wallCubePaint(design.style),
      finish: wallCubeFinish(design.style, place),
      empty: !sample && !drawn,
      artwork: sample ? (
        <SignatureArt variant={place - 1} />
      ) : drawn ? (
        <DemoInk strokes={mark.strokes} />
      ) : (
        <span>+</span>
      ),
      demoName: sample ? ['mira', 'leo', 'nika'][place - 1] : undefined,
      detail: drawn ? t('Your autograph') : undefined,
    };

    return (
      <>
        <button
          type="button"
          className={sample ? wall.cubeOpen : wall.slotAction}
          aria-haspopup="dialog"
          aria-label={t(
            sample
              ? 'Explore demo cube in place {place}'
              : drawn
                ? 'Edit your autograph in place {place}'
                : mark
                  ? 'Move your autograph to place {place}'
                  : 'Sign demo place {place}',
            { place },
          )}
          onClick={() => (sample ? setViewing(details) : setEditing(place))}
        >
          <CubePreview details={details} />
          {!sample && (
            <span>{t(drawn ? 'Your autograph' : 'Sign this place')}</span>
          )}
        </button>
        {drawn && (
          <button
            type="button"
            className={wall.cubeInspect}
            aria-haspopup="dialog"
            onClick={() => setViewing(details)}
          >
            {t('Rotate cube')}
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className={styles.meta}>
        <p>
          {t(
            'Change the design, rotate a cube or sign a free place. Your changes stay in this tab.',
          )}
        </p>
        <button
          type="button"
          disabled={processingImage}
          onClick={() => {
            setDesign(initialDesign);
            setMark(null);
            setImageError(false);
          }}
        >
          {t('Reset demo')}
        </button>
      </div>
      <div className={styles.editor}>
        <fieldset disabled={processingImage} className={styles.fields}>
          <WallDesignFields
            value={design}
            update={setDesign}
            onImage={(field, file) => void addImage(field, file)}
          />
          {imageError && (
            <p role="alert">
              {t(
                'Choose a PNG, JPEG or WebP image up to 10 MB and 20 megapixels.',
              )}
            </p>
          )}
        </fieldset>
        <WallDesignPreview
          design={design}
          owner="Nova Ray"
          renderPlace={renderPlace}
        />
      </div>
      {mark && (
        <p className={styles.screenReader} role="status">
          {t('Your autograph is in place {place}.', { place: mark.place })}
        </p>
      )}
      {viewing && (
        <CubeViewer details={viewing} onClose={() => setViewing(null)} />
      )}
      {editing !== null && (
        <DemoDrawingDialog
          place={editing}
          initialStrokes={mark?.strokes}
          moving={Boolean(mark && mark.place !== editing)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setMark(next);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
