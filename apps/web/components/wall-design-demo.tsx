'use client';

import { useRef, useState } from 'react';
import { wallCubeFinish, type WallDesign } from '@digital-autograph/domain';
import { wallCubePaint } from '../lib/wall-design-presentation';
import { appearanceImageFile } from '../lib/appearance-image-file';
import { readWallDesignFile } from '../lib/wall-design-file';
import { CubePreview, CubeViewer, type CubeDetails } from './autograph-cube';
import { DemoDrawingDialog, DemoInk, type DemoMark } from './demo-wall-drawing';
import { useLocale } from './locale-provider';
import { SignatureArt } from './signature-art';
import { WallDesignFields, type DesignImage } from './wall-design-fields';
import { WallDesignFileControls } from './wall-design-file-controls';
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
  const [fileError, setFileError] = useState('');
  const [designFileLoaded, setDesignFileLoaded] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);
  const fileBusy = useRef(false);

  function update(next: WallDesign) {
    setDesign(next);
    setDesignFileLoaded(false);
  }

  async function loadFile(field: DesignImage | 'design', file: File) {
    if (fileBusy.current) return;
    fileBusy.current = true;
    setProcessingFile(true);
    setFileError('');
    setDesignFileLoaded(false);
    try {
      if (field === 'design') {
        setDesign(await readWallDesignFile(file));
        setDesignFileLoaded(true);
        return;
      }
      const source = await appearanceImageFile(
        file,
        field === 'avatarDataUrl' ? 'avatar' : 'wall-cover',
      );
      setDesign((current) => ({ ...current, [field]: source }));
    } catch {
      setFileError(
        field === 'design'
          ? 'Choose a valid Supcube wall design file.'
          : 'Choose a PNG, JPEG or WebP image up to 10 MB and 20 megapixels.',
      );
    } finally {
      fileBusy.current = false;
      setProcessingFile(false);
    }
  }

  function renderPlace(place: number) {
    const sample = place <= 3;
    const drawn = mark?.place === place;
    const details: CubeDetails = {
      place,
      podium: design.style.podium,
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
        <a href="/demo/supcube-ice-room.wall-design.json" download>
          {t('Download an example design')}
        </a>
        <button
          type="button"
          disabled={processingFile}
          onClick={() => {
            setDesign(initialDesign);
            setMark(null);
            setFileError('');
            setDesignFileLoaded(false);
          }}
        >
          {t('Reset demo')}
        </button>
      </div>
      <div className={styles.editor}>
        <fieldset disabled={processingFile} className={styles.fields}>
          <WallDesignFileControls
            design={design}
            onImport={(file) => void loadFile('design', file)}
          />
          {fileError && <p role="alert">{t(fileError)}</p>}
          {designFileLoaded && (
            <p role="status">{t('Design file loaded into the preview.')}</p>
          )}
          <WallDesignFields
            value={design}
            update={update}
            onImage={(field, file) => void loadFile(field, file)}
          />
        </fieldset>
        <WallDesignPreview
          design={design}
          owner="Nova Ray"
          renderPlace={renderPlace}
          onChange={update}
          materialsDisabled={processingFile}
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
