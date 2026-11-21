import styles from './cobalt-signature.module.css';

export function CobaltSignature() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 650 310"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.guides}>
        <path d="M16 116h618M16 182h618M16 248h618M75 68v216M579 68v216" />
        <circle cx="75" cy="116" r="3" />
        <circle cx="579" cy="248" r="3" />
      </g>
      <path
        className={styles.stroke}
        pathLength="1"
        d="M49 222C87 199 123 165 145 132C169 95 174 66 157 66C123 66 97 153 97 190C98 221 112 230 137 220C171 207 215 168 252 130C276 105 299 80 304 87C312 98 289 133 274 162C258 193 260 217 280 216C309 214 344 188 368 166C382 153 398 135 389 135C371 136 349 160 347 181C344 208 379 216 413 194C443 173 453 150 468 146C487 141 449 190 464 198C473 203 500 189 520 175C542 160 545 157 540 170C528 201 557 199 597 175"
      />
      <path
        className={styles.stroke}
        pathLength="1"
        d="M107 257C223 220 384 219 552 233"
      />
      <path
        className={styles.stroke}
        pathLength="1"
        d="M524 113c7-17 23-22 29-9 14-13 28-7 24 4-4 10-19 19-27 24-9-3-25-9-26-19Z"
      />
    </svg>
  );
}
