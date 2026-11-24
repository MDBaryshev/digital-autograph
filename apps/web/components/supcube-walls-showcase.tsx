import { SignatureArt } from './signature-art';
import { Icon } from './ui-icon';
import { myWallPath } from '../lib/wall-design-links';
import styles from './supcube-design-lab.module.css';

/** Illustrations describe the product; they do not stand in for live creators. */
export function SupcubeWallsShowcase() {
  return (
    <div className={styles.wallShowcase}>
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
        <div className={styles.wallTiles} aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <div
              key={index}
              data-filled={index < 6 || undefined}
              data-rank={index < 3 ? index + 1 : undefined}
            >
              {index < 6 ? (
                <SignatureArt variant={index} />
              ) : (
                <Icon name="plus" size={18} />
              )}
              <span>{String(index + 1).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
        <div className={styles.wallIllustrationFooter}>
          <span>Каждый автограф — отдельная история.</span>
          <span>Твой круг.</span>
        </div>
      </div>
      <aside className={styles.wallInvitation}>
        <span className={styles.eyebrow}>ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h3>
          Собери тех,
          <br />
          кто <em>рядом.</em>
        </h3>
        <p>
          У каждого автора одна стена на 10 мест. Пригласи людей, чьи автографы
          хочешь сохранить.
        </p>
        <a href={myWallPath}>
          Моя стена <Icon name="arrow" size={18} />
        </a>
        <a href="/walls/demo">Попробовать без входа</a>
        <small>Есть приглашение? Открой его ниже.</small>
      </aside>
    </div>
  );
}
