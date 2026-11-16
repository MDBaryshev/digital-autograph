'use client';

import { useState } from 'react';
import { BrandMark, Icon } from './ui-icon';
import { SignatureArt } from './signature-art';
import { CommunityCubeArtwork } from './community-cube-home';
import { TryWall } from './try-wall';
import styles from './supcube-design-lab.module.css';

function PersonalCube({ variant = 0 }: { variant?: number }) {
  return (
    <div className={styles.personalCube} aria-hidden="true">
      <div className={styles.personalFront}>
        <span>ТВОЙ ПОЧЕРК</span>
        <SignatureArt variant={variant} />
        <small>один из нас.</small>
      </div>
      <div className={styles.personalRight}>
        <span>supcube</span>
        <Icon name="pen" size={34} />
      </div>
      <div className={styles.personalTop}>
        <BrandMark />
      </div>
    </div>
  );
}

export function SupcubeDesignLab() {
  const [direction, setDirection] = useState<'community' | 'cube'>('community');
  const [mobile, setMobile] = useState(false);
  const bold = direction === 'cube';

  return (
    <main className={styles.lab} data-design-lab>
      <div className={styles.tools}>
        <div className={styles.labIdentity}>
          <a href="/" aria-label="Вернуться на основную главную">
            <Icon name="arrow" size={18} />
          </a>
          <div>
            <strong>supcube</strong>
            <span>ДИЗАЙН-СТУДИЯ / 01</span>
          </div>
        </div>
        <div
          className={styles.switcher}
          role="group"
          aria-label="Направление дизайна"
        >
          <button
            type="button"
            aria-pressed={!bold}
            onClick={() => setDirection('community')}
          >
            <span>A</span> Куб как часть сайта
          </button>
          <button
            type="button"
            aria-pressed={bold}
            onClick={() => setDirection('cube')}
          >
            <span>B</span> Куб в центре
          </button>
        </div>
        <button
          className={styles.mobileToggle}
          type="button"
          aria-pressed={mobile}
          onClick={() => setMobile(!mobile)}
        >
          {mobile ? 'Полная ширина' : 'Мобильный вид'}
        </button>
      </div>

      <div className={styles.context} aria-live="polite">
        <p>
          <b>
            {bold
              ? 'B / Куб — главный образ supcube.'
              : 'A / Сначала твой автограф, затем общее сообщество.'}
          </b>{' '}
          {bold
            ? 'Больше пространства, объёма и общего движения. Проверяем, понятен ли первый шаг.'
            : 'Сохраняем знакомый путь к стенам авторов и добавляем куб как место, объединяющее всех.'}
        </p>
        <span>Локальный макет · все примеры — демо</span>
      </div>

      <div className={styles.preview} data-mobile={mobile || undefined}>
        <div className={styles.website} data-direction={direction}>
          <header className={styles.navigation}>
            <a className={styles.wordmark} href="/">
              <BrandMark />
              <span>supcube</span>
            </a>
            <nav aria-label="Навигация макета">
              <a href="#design-wall">Стены авторов</a>
              <a href="/community-cube">
                Общий куб <span>↗</span>
              </a>
            </nav>
            <a className={styles.account} href="/me">
              <Icon name="user" size={17} />
              <span>Войти</span>
            </a>
          </header>

          <section
            className={styles.hero}
            aria-labelledby="design-hero-title"
            key={direction}
          >
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                <span />{' '}
                {bold
                  ? 'МАЛЕНЬКИЙ СЛЕД. БОЛЬШАЯ ИСТОРИЯ.'
                  : 'МЕСТО ДЛЯ ТВОЕГО ПОЧЕРКА'}
              </p>
              <h1 id="design-hero-title">
                {bold ? (
                  <>
                    Каждый почерк
                    <br />
                    делает нас
                    <br />
                    <em>больше.</em>
                  </>
                ) : (
                  <>
                    Твой почерк.
                    <br />
                    Чья-то
                    <br />
                    <em>история.</em>
                  </>
                )}
              </h1>
              <p className={styles.lead}>
                {bold
                  ? 'Оставь автограф у любимого автора. А общий куб станет местом, где однажды встретятся все наши подписи.'
                  : 'Нарисуй свой автограф и оставь его на стене любимого автора. Маленький жест, который остаётся.'}
              </p>
              <div className={styles.actions}>
                <a className={styles.primary} href="/autograph/create">
                  Создать автограф <Icon name="arrow" size={18} />
                </a>
                <a href={bold ? '/community-cube' : '#design-wall'}>
                  {bold ? 'Исследовать куб' : 'Попробовать на демостене'}{' '}
                  <span>↗</span>
                </a>
              </div>
              <p className={styles.heroNote}>
                {bold
                  ? 'Общий куб пока работает как прототип.'
                  : 'Демостена ниже работает без регистрации.'}
              </p>
            </div>
            <div className={styles.heroStage}>
              <div className={styles.orbit} aria-hidden="true" />
              {bold ? (
                <>
                  <div className={styles.communityArt}>
                    <CommunityCubeArtwork />
                  </div>
                  <span className={styles.stageLabel}>
                    МНОГО ПОЧЕРКОВ.
                    <br />
                    <b>ОДНО МЕСТО.</b>
                  </span>
                  <div className={styles.cubeCaption}>
                    <span>ОБЩИЙ КУБ / ДЕМО</span>
                    <p>
                      <b>96</b> / 144 ячейки
                    </p>
                    <div>
                      <i />
                    </div>
                    <small>Заполнится — вырастет.</small>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.smallCube}>
                    <PersonalCube variant={2} />
                  </div>
                  <div className={styles.mainCube}>
                    <PersonalCube />
                  </div>
                  <span className={styles.handNote}>
                    Твой след.
                    <br />
                    Без копий.
                  </span>
                  <span className={styles.stageLabel}>
                    ПОДПИСЬ — ТВОЯ.
                    <br />
                    <b>ИСТОРИЯ — ОБЩАЯ.</b>
                  </span>
                </>
              )}
            </div>
          </section>

          <div className={styles.chapter}>
            <span>01 / ЛИЧНОЕ</span>
            <span>Автограф → стена автора → общая история</span>
            <Icon name="down" size={18} />
          </div>

          <section
            className={styles.wallSection}
            id="design-wall"
            aria-labelledby="design-wall-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>БЛИЖЕ К ТЕМ, КТО ТЕБЕ НРАВИТСЯ</p>
                <h2 id="design-wall-title">
                  Не просто смотреть.
                  <br />
                  <em>Оставаться частью.</em>
                </h2>
              </div>
              <p>
                У каждой стены — свой автор и 10 мест. Здесь можно попробовать
                оставить след: это демонстрация, а не настоящая стена.
              </p>
            </div>
            <TryWall />
          </section>

          <section
            className={styles.communitySection}
            aria-labelledby="design-community-title"
          >
            <div className={styles.communityCopy}>
              <p className={styles.eyebrow}>02 / ОБЩЕЕ</p>
              <h2 id="design-community-title">
                А вместе мы
                <br />
                занимаем <em>больше места.</em>
              </h2>
              <p>
                Стены связывают тебя с авторами. Общий куб — со всем
                сообществом. Когда он заполнится, все автографы останутся на
                лицевой грани следующего куба.
              </p>
              <a className={styles.primary} href="/community-cube">
                Покрутить общий куб <Icon name="arrow" size={18} />
              </a>
              <small>Прототип: примеры и счётчики демонстрационные.</small>
            </div>
            <div className={styles.communityVisual}>
              <CommunityCubeArtwork />
              <div className={styles.growth}>
                <span>24</span>
                <Icon name="arrow" size={16} />
                <span>144</span>
                <Icon name="arrow" size={16} />
                <span>864</span>
              </div>
              <p>Вместимость кубов, а не число участников.</p>
            </div>
          </section>

          <section className={styles.how} aria-labelledby="design-how-title">
            <div>
              <p className={styles.eyebrow}>ТРИ ПРОСТЫХ ШАГА</p>
              <h2 id="design-how-title">
                От руки.
                <br />
                <em>К людям.</em>
              </h2>
            </div>
            <ol>
              <li>
                <span>01</span>
                <h3>Создай автограф</h3>
                <p>
                  Нарисуй его или загрузи фото. Оригинал останется приватным.
                </p>
              </li>
              <li>
                <span>02</span>
                <h3>Дождись одобрения</h3>
                <p>Проверь обработанный вариант и отправь его на модерацию.</p>
              </li>
              <li>
                <span>03</span>
                <h3>Оставь свой след</h3>
                <p>Открой стену по приглашению и выбери свободное место.</p>
              </li>
            </ol>
          </section>
          <footer className={styles.footer}>
            <a className={styles.wordmark} href="/">
              <BrandMark />
              <span>supcube</span>
            </a>
            <p>Каждый почерк имеет значение.</p>
            <a href="/legal">Документы</a>
          </footer>
        </div>
      </div>

      <aside className={styles.decision}>
        <div>
          <span>ЧТО ПРЕДЛАГАЮ ВЗЯТЬ В РАБОТУ</span>
          <h2>
            {bold
              ? 'Выразительность B. Ясность A.'
              : 'Начать с A и сохранить характер B.'}
          </h2>
        </div>
        <p>
          Один выразительный общий куб, узнаваемый знак и геометрия в деталях.
          На стенах, в студии и настройках важнее понятные действия. Общий куб
          подключаем к реальным аккаунтам отдельным этапом.
        </p>
        <a href="/community-cube">
          Открыть сохранённый прототип <Icon name="arrow" size={18} />
        </a>
      </aside>
    </main>
  );
}
