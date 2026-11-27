import { CubePreview } from './autograph-cube';
import { SignatureArt } from './signature-art';
import { Icon } from './ui-icon';
import styles from './supcube-design-lab.module.css';

/** Illustrations describe the product; they do not stand in for live creators. */
export function SupcubeWallsShowcase() {
  return (
    <div
      className={styles.wallIllustration}
      role="img"
      aria-label="Иллюстрация стены на десять мест"
    >
      <div className={styles.wallIdentity}>
        <span>
          <Icon name="pen" size={22} />
        </span>
        <div>
          <strong>Место для своих</strong>
          <small>Твоя стена · 10 мест</small>
        </div>
        <span className={styles.wallIllustrationLabel}>Иллюстрация</span>
      </div>
      <ol className={styles.wallTiles} aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => {
          const place = index + 1;
          const filled = index < 6;
          const artwork = filled ? (
            <SignatureArt variant={index} />
          ) : (
            <Icon name="plus" size={18} />
          );

          return (
            <li key={place} className={styles.wallTile}>
              <div
                className={styles.wallTileCard}
                data-filled={filled || undefined}
                data-rank={place <= 3 ? place : undefined}
              >
                {artwork}
                <span>{String(place).padStart(2, '0')}</span>
              </div>
              <CubePreview details={{ place, artwork, empty: !filled }} />
            </li>
          );
        })}
      </ol>
      <div className={styles.wallIllustrationFooter}>
        <span>Каждый автограф — отдельная история.</span>
        <span>Твой круг.</span>
      </div>
    </div>
  );
}
