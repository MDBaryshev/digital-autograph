import { useId, type CSSProperties } from 'react';
import styles from './autograph-cube.module.css';

const angles = [0, 45, 90, 135, 180, 225, 270, 315];

function Stone({
  at,
  scale = 1,
  fill,
}: {
  at: [number, number];
  scale?: number;
  fill: string;
}) {
  return (
    <g
      transform={`translate(${at[0]} ${at[1]}) scale(${scale})`}
      data-diamond-stone
    >
      <path
        d="M0-14 8-8 9 1 0 12-9 1-8-8Z"
        fill={fill}
        stroke="#e7f9ff"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="m0-14 8 6-4 5-4-11ZM-9 1l5-4 4 15Z" fill="#609bbf" />
      <path d="m0-14-8 6 4 5 4-11Zm4 11 5 4L0 12Z" fill="#f1fbff" />
      <path
        d="M0-14-4-3 0 4 4-3 0-14M-9 1 0 4l9-3M0 4v8"
        fill="none"
        stroke="#fff"
        strokeOpacity=".75"
        strokeWidth=".65"
      />
    </g>
  );
}

export function DiamondCrown() {
  const id = useId();
  const metal = 'url(#' + id + '-metal)';
  const diamond = 'url(#' + id + '-stone)';

  return (
    <span
      className={styles.sculpture}
      data-podium-sculpture="diamond"
      data-diamond-crown="viewer"
      aria-hidden="true"
    >
      <svg width="0" height="0" className={styles.diamondCrownDefs}>
        <defs>
          <linearGradient id={id + '-metal'} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ebf7ff" />
            <stop offset=".37" stopColor="#9eb5d0" />
            <stop offset=".63" stopColor="#effaff" />
            <stop offset="1" stopColor="#546b8d" />
          </linearGradient>
          <linearGradient id={id + '-stone'} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset=".48" stopColor="#d5f0ff" />
            <stop offset="1" stopColor="#76a5cc" />
          </linearGradient>
        </defs>
      </svg>
      {angles.map((angle, index) => {
        const tip = index === 0 ? 33 : index % 2 === 0 ? 42 : 53;
        return (
          <svg
            key={angle}
            className={styles.diamondCrownPanel}
            viewBox="0 0 60 96"
            preserveAspectRatio="none"
            style={{ '--band-angle': angle + 'deg' } as CSSProperties}
          >
            <path d="M0 81H60V92H0Z" fill={metal} />
            <path
              d={`M0 81Q19 79 30 ${tip + 8}Q41 79 60 81M0 76Q16 74 27 ${tip + 9}M60 76Q44 74 33 ${tip + 9}M7 81Q14 68 22 76Q30 85 38 76Q46 68 53 81`}
              fill="none"
              stroke={metal}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path d="M0 82.5H60M0 90H60" stroke="#e9f6ff" strokeWidth=".9" />
            <path
              d="M3 86.5h54"
              stroke="#f6fdff"
              strokeWidth="3"
              strokeDasharray=".6 6"
              strokeLinecap="round"
            />
            <Stone
              at={[30, tip]}
              scale={index === 0 ? 1.12 : 0.74}
              fill={diamond}
            />
          </svg>
        );
      })}
    </span>
  );
}
