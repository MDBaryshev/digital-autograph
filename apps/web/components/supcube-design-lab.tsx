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
              : 'A / Выбрано: твой автограф сразу на общем кубе.'}
          </b>{' '}
          {bold
            ? 'Больше пространства, объёма и общего движения. Проверяем, понятен ли первый шаг.'
            : 'Первое действие — нарисовать автограф и самому выбрать свободную ячейку. Стены авторов остаются следующим шагом.'}
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
                  : 'Нарисуй автограф, выбери любое свободное место на общем кубе и стань частью общей истории. А потом оставляй свой почерк у любимых авторов.'}
              </p>
              <div className={styles.actions}>
                <a className={styles.primary} href="/community-cube?create=1">
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
                  : 'Попробуй сейчас: рисунок и выбор места без регистрации. Это демо.'}
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
            <span>Автограф → своё место на общем кубе → стены авторов</span>
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
                Твоя первая подпись сразу становится частью общего куба — на
                месте, которое выберешь ты. Когда куб заполнится, все автографы
                останутся на лицевой грани следующего.
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
                <h3>Выбери своё место</h3>
                <p>
                  Открой любую грань общего куба и нажми на свободную ячейку.
                </p>
              </li>
              <li>
                <span>03</span>
                <h3>Ты на общем кубе</h3>
                <p>
                  Автограф появится на выбранном месте. Затем можно исследовать
                  стены авторов.
                </p>
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
          <span>В РАБОТЕ: ВАРИАНТ A</span>
          <h2>
            {bold
              ? 'Выразительность B. Ясность A.'
              : 'Создание и первое размещение — один путь.'}
          </h2>
        </div>
        <p>
          В прототипе после рисования пользователь сам выбирает свободное место
          на любой грани. Занятые ячейки недоступны. Реальные аккаунты,
          модерация и защита от одновременного выбора места подключаются на
          сервере отдельно.
        </p>
        <a href="/community-cube">
          Открыть сохранённый прототип <Icon name="arrow" size={18} />
        </a>
      </aside>
    </main>
  );
}
