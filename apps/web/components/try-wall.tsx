'use client';

import { useState } from 'react';
import { DemoDrawingDialog, DemoInk, type DemoMark } from './demo-wall-drawing';
import { useLocale } from './locale-provider';
import { SignatureArt } from './signature-art';
import { CubePreview, CubeViewer, type CubeDetails } from './autograph-cube';
import { Icon } from './ui-icon';
import styles from './try-wall.module.css';

const places = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function TryWall() {
  const { t } = useLocale();
  const [editing, setEditing] = useState<number | null>(null);
  const [mark, setMark] = useState<DemoMark | null>(null);
  const [viewing, setViewing] = useState<CubeDetails | null>(null);

  return (
    <section
      className={styles.stage}
      aria-labelledby="try-wall-heading"
      data-ui
    >
      <div className={styles.header}>
        <div>
          <h2 id="try-wall-heading" tabIndex={-1}>
            {t('Try the Wall')}
          </h2>
          <p>
            <span className={styles.pointerHint}>
              {t('Click an autograph to open its cube, or sign a free place.')}
            </span>
            <span className={styles.touchHint}>
              {t('Tap an autograph to rotate its cube. Or sign a free place.')}
            </span>
          </p>
        </div>
        <span className={styles.badge}>{t('Demo')}</span>
      </div>
      <ol className={styles.grid} role="list">
        {places.map((place) => {
          const drawn = mark?.place === place;
          const details: CubeDetails = {
            place,
            artwork:
              place <= 3 ? (
                <SignatureArt variant={place - 1} />
              ) : drawn ? (
                <DemoInk strokes={mark.strokes} />
              ) : (
                <span>+</span>
              ),
            demoName:
              place <= 3 ? ['mira', 'leo', 'nika'][place - 1] : undefined,
            empty: place > 3 && !drawn,
          };
          return (
            <li
              key={place}
              className={styles.place}
              data-podium={place <= 3 ? '' : undefined}
            >
              <button
                type="button"
                className={styles.cubeButton}
                data-first={place === 4 && !mark ? '' : undefined}
                aria-haspopup="dialog"
                aria-label={t(
                  place <= 3
                    ? 'Explore demo cube in place {place}'
                    : drawn
                      ? 'Edit your autograph in place {place}'
                      : mark
                        ? 'Move your autograph to place {place}'
                        : 'Sign demo place {place}',
                  { place },
                )}
                onClick={() =>
                  place <= 3 ? setViewing(details) : setEditing(place)
                }
              >
                <CubePreview details={details} />
                <span className={styles.plinth} aria-hidden="true">
                  <span>{String(place).padStart(2, '0')}</span>
                  <span>
                    {place <= 3
                      ? `@${details.demoName}`
                      : t(drawn ? 'Your autograph' : 'Free place')}
                  </span>
                  <Icon name={place <= 3 ? 'arrow' : 'plus'} size={14} />
                </span>
              </button>
              {place > 3 && (
                <button
                  type="button"
                  className={styles.explore}
                  aria-label={t('Explore cube in slot {place}', { place })}
                  aria-haspopup="dialog"
                  onClick={() => setViewing(details)}
                >
                  {t('Rotate cube')}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.footer}>
        <span role="status">
          {mark
            ? t('Your autograph is in place {place}.', { place: mark.place })
            : t('No account needed')}
        </span>
        {mark ? (
          <a href="/autograph/create">
            {t('Go to studio')} <Icon name="arrow" size={17} />
          </a>
        ) : (
          <span aria-hidden="true">{t('10 places')}</span>
        )}
      </div>
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
    </section>
  );
}
