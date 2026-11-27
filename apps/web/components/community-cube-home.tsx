import { Icon } from './ui-icon';
import styles from './community-cube-home.module.css';

const copy = {
  ru: {
    eyebrow: 'ОБЩИЙ КУБ SUPCUBE',
    badge: 'Локальный концепт',
    title: 'Разные почерки.',
    emphasis: 'Одна общая история.',
    description:
      'Большой куб из маленьких автографов. Когда он заполнится, все подписи останутся на лицевой грани следующего — ещё большего.',
    action: 'Открыть общий куб',
    note: 'На превью — демонстрационные автографы.',
    capacity: 'Места в первых трёх кубах',
    first: 'Первый куб: 4 автографа на каждой грани.',
  },
  en: {
    eyebrow: 'THE SUPCUBE COMMUNITY CUBE',
    badge: 'Local concept',
    title: 'Different handwriting.',
    emphasis: 'One shared story.',
    description:
      'A big cube made of little autographs. Once it fills up, every signature stays on the front face of the next, larger cube.',
    action: 'Explore the community cube',
    note: 'The preview shows illustrative autographs.',
    capacity: 'Places in the first three cubes',
    first: 'The first cube: 4 autographs on each face.',
  },
};

const signaturePaths = [
  'M2 11C6 7 9 0 10 2S4 15 7 12c3-4 3-7 4-4s0 4 3 1l3-2M3 15l15-3',
  'M2 12C6 1 13 1 10 6S3 13 6 9c2-2 4-2 5 0s0 4 3 1l3-3M2 15l16-3',
  'M2 12 9 2c4-3-1 12 2 10l3-4c2-2 0 4 3 2M3 15l15-3',
  'M4 12C0 1 14 0 9 7s-6 8-2 6l6-6c2-2 0 5 3 3M3 15l15-3',
];

function MiniatureFace({
  transform,
  color,
  occupied,
  offset,
  height = 140,
}: {
  transform: string;
  color: string;
  occupied: number;
  offset: number;
  height?: number;
}) {
  const width = 120 / 6;
  const rowHeight = height / 4;
  return (
    <g transform={transform}>
      <path d={`M0 0h120v${height}H0z`} fill={color} />
      {Array.from({ length: 24 }, (_, index) => {
        const x = (index % 6) * width;
        const y = Math.floor(index / 6) * rowHeight;
        const filled = index < occupied;
        return (
          <g key={index} transform={`translate(${x} ${y})`}>
            <rect
              x="1"
              y="1"
              width={width - 2}
              height={rowHeight - 2}
              rx="1"
              fill={filled ? '#f5e9d6' : '#c5b296'}
              fillOpacity={filled ? 0.88 : 0.42}
              stroke="#886c45"
              strokeOpacity=".2"
              strokeWidth=".4"
            />
            {filled ? (
              <path
                d={signaturePaths[(index + offset) % signaturePaths.length]}
                transform={`translate(1 ${(rowHeight - 17) / 2})`}
                fill="none"
                stroke={['#67452d', '#72534d', '#4c5746'][(index + offset) % 3]}
                strokeWidth=".65"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d={`M8 ${rowHeight / 2}h4m-2-2v4`}
                stroke="#8d7859"
                strokeWidth=".5"
                strokeOpacity=".5"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function CommunityCubeArtwork() {
  return (
    <svg viewBox="0 0 360 330" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="180" cy="305" rx="112" ry="10" fill="#604124" opacity=".1" />
      <ellipse cx="180" cy="305" rx="75" ry="5" fill="#604124" opacity=".08" />
      <MiniatureFace
        transform="matrix(1 .5 0 1 60 96)"
        color="#bda27b"
        occupied={24}
        offset={0}
      />
      <MiniatureFace
        transform="matrix(1 -.5 0 1 180 156)"
        color="#b49b77"
        occupied={15}
        offset={2}
      />
      <MiniatureFace
        transform="matrix(1 .5 -1 .5 180 36)"
        color="#dfccb0"
        occupied={24}
        offset={1}
        height={120}
      />
      <path
        d="m60 96 120 60 120-60M180 156v140"
        stroke="#795d37"
        strokeOpacity=".45"
        strokeWidth=".65"
      />
    </svg>
  );
}

export function CommunityCubeHome({ locale }: { locale: 'ru' | 'en' }) {
  const text = copy[locale];
  return (
    <section className={styles.card} aria-labelledby="home-community-heading">
      <div className={styles.copy}>
        <div className={styles.labels}>
          <span className={styles.eyebrow}>{text.eyebrow}</span>
          <span className={styles.badge}>{text.badge}</span>
        </div>
        <h2 id="home-community-heading">
          {text.title}
          <br />
          <em>{text.emphasis}</em>
        </h2>
        <p className={styles.description}>{text.description}</p>
        <a className={styles.action} href="/community-cube">
          {text.action} <Icon name="arrow" size={18} />
        </a>
        <p className={styles.note}>{text.note}</p>
      </div>
      <div className={styles.preview}>
        <div className={styles.artwork}>
          <CommunityCubeArtwork />
        </div>
        <div className={styles.capacity}>
          <span>{text.capacity}</span>
          <p>
            24 <Icon name="arrow" size={14} /> 144{' '}
            <Icon name="arrow" size={14} /> 864
          </p>
          <small>{text.first}</small>
        </div>
      </div>
    </section>
  );
}
