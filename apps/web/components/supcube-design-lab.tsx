'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { BrandMark, Icon } from './ui-icon';
import { SignatureArt } from './signature-art';
import { CommunityCubeArtwork } from './community-cube-home';
import { TryWall } from './try-wall';
import { OpenInvitation } from './open-invitation';
import { CommunityCube, type CubePlacementPreview } from './community-cube';
import { DraftAutograph } from './community-cube-place-picker';
import { SupcubeWallsShowcase } from './supcube-walls-showcase';
import styles from './supcube-design-lab.module.css';

function PersonalCube({
  variant = 0,
  placement,
}: {
  variant?: number;
  placement?: CubePlacementPreview | null;
}) {
  return (
    <div className={styles.personalCube} aria-hidden="true">
      <div className={styles.personalFront}>
        <span>
          {placement ? `ТВОЁ МЕСТО / ${placement.slot}` : 'ТВОЙ ПОЧЕРК'}
        </span>
        {placement ? (
          <DraftAutograph strokes={placement.strokes} />
        ) : (
          <SignatureArt variant={variant} />
        )}
        <small>{placement ? 'теперь ты часть истории.' : 'один из нас.'}</small>
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

export function SupcubeDesignLab({
  standalone = false,
  initialCube,
}: {
  standalone?: boolean;
  initialCube?: 'create' | 'view';
}) {
  const [direction, setDirection] = useState<'community' | 'cube'>('community');
  const [mobile, setMobile] = useState(false);
  const bold = direction === 'cube';
  const workflow = useRef<HTMLDialogElement>(null);
  const workflowOpener = useRef<HTMLElement | null>(null);
  const [cubeOpen, setCubeOpen] = useState(Boolean(initialCube));
  const [cubeMounted, setCubeMounted] = useState(Boolean(initialCube));
  const [creationRequest, setCreationRequest] = useState(
    initialCube === 'create' ? 1 : 0,
  );
  const [focusRequest, setFocusRequest] = useState(0);
  const [placement, setPlacement] = useState<CubePlacementPreview | null>(null);
  const hasPersonal = placement !== null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  useLayoutEffect(() => {
    const node = workflow.current;
    if (!node || !cubeOpen) return;
    const previousFocus = workflowOpener.current ?? document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
      workflowOpener.current = null;
    };
  }, [cubeOpen]);
  const openCube = (event: MouseEvent<HTMLAnchorElement>, create = false) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const openedFromMenu =
      menuOpen &&
      event.currentTarget.closest('nav') &&
      menuToggle.current &&
      menuToggle.current.getBoundingClientRect().width > 0;
    workflowOpener.current = openedFromMenu
      ? menuToggle.current
      : event.currentTarget;
    setMenuOpen(false);
    setCubeMounted(true);
    if (create) {
      if (hasPersonal) setFocusRequest((value) => value + 1);
      else setCreationRequest((value) => value + 1);
    }
    setCubeOpen(true);
  };

  return (
    <main
      className={`${styles.lab} ${standalone ? styles.homepage : ''}`}
      data-design-lab
    >
      {!standalone && (
        <>
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
        </>
      )}

      <div className={styles.preview} data-mobile={mobile || undefined}>
        <div className={styles.website} data-direction={direction}>
          <header className={styles.navigation}>
            <a className={styles.wordmark} href="/">
              <BrandMark />
              <span>supcube</span>
            </a>
            <nav
              id="supcube-navigation"
              aria-label="Навигация supcube"
              data-open={menuOpen || undefined}
            >
              <a href="#design-wall" onClick={() => setMenuOpen(false)}>
                Стены авторов
              </a>
              <a href="/community-cube" onClick={(event) => openCube(event)}>
                Общий куб <span>↗</span>
              </a>
              <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
                Как это работает
              </a>
            </nav>
            <a
              className={styles.account}
              href="/me"
              aria-label={standalone ? 'Личный кабинет' : 'Войти'}
            >
              <Icon name="user" size={17} />
              <span>{standalone ? 'Личный кабинет' : 'Войти'}</span>
            </a>
            <button
              className={styles.menuToggle}
              ref={menuToggle}
              type="button"
              aria-label={menuOpen ? 'Закрыть навигацию' : 'Открыть навигацию'}
              aria-expanded={menuOpen}
              aria-controls="supcube-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
            </button>
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
                <a
                  className={styles.primary}
                  href="/community-cube?create=1"
                  onClick={(event) => openCube(event, true)}
                >
                  {hasPersonal ? 'К моему автографу' : 'Создать автограф'}{' '}
                  <Icon name="arrow" size={18} />
                </a>
                <a
                  href={bold || standalone ? '/community-cube' : '#design-wall'}
                  onClick={
                    bold || standalone ? (event) => openCube(event) : undefined
                  }
                >
                  {bold
                    ? 'Исследовать куб'
                    : standalone
                      ? 'Открыть общий куб'
                      : 'Попробовать на демостене'}{' '}
                  <span>↗</span>
                </a>
              </div>
              <p className={styles.heroNote}>
                {standalone
                  ? 'Один автограф. Свободное место. Твоя часть общей истории.'
                  : bold
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
                    <PersonalCube placement={placement} />
                  </div>
                  {placement && (
                    <div className={styles.memberStamp}>
                      <Icon name="check" size={16} />
                      <div>
                        <strong>Ты на общем кубе</strong>
                        <span>
                          Куб {placement.generation} · место № {placement.slot}
                        </span>
                      </div>
                    </div>
                  )}
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
                {standalone
                  ? 'У каждой стены — свой автор и десять мест для людей, которые хотят оставить больше, чем лайк.'
                  : 'У каждой стены — свой автор и 10 мест. Здесь можно попробовать оставить след: это демонстрация, а не настоящая стена.'}
              </p>
            </div>
            {standalone ? <SupcubeWallsShowcase /> : <TryWall />}
            <OpenInvitation />
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
              <a
                className={styles.primary}
                href="/community-cube"
                onClick={(event) => openCube(event)}
              >
                {standalone ? 'Открыть общий куб' : 'Покрутить общий куб'}{' '}
                <Icon name="arrow" size={18} />
              </a>
              <small>
                {standalone
                  ? 'У каждого поколения — своё место в общей истории.'
                  : 'Прототип: примеры и счётчики демонстрационные.'}
              </small>
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

          <section
            className={styles.how}
            id="how-it-works"
            aria-labelledby="design-how-title"
          >
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
                  Нарисуй свой автограф от руки — именно он появится на
                  выбранном месте общего куба.
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
            <nav aria-label="Информация о сервисе">
              <a href="/legal">Документы</a>
              <a href="/security">Безопасность</a>
            </nav>
            {standalone && (
              <details className={styles.releaseInfo}>
                <summary>Предварительная версия</summary>
                <p>
                  Эта версия даёт создать автограф и выбрать место в общем кубе.
                  Сейчас куб не связан с аккаунтом: рисунок хранится до закрытия
                  или обновления страницы. Остальные подписи — образцы.
                </p>
              </details>
            )}
          </footer>
        </div>
      </div>

      {!standalone && (
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
            В прототипе после рисования пользователь сам выбирает свободное
            место на любой грани. Занятые ячейки недоступны. Реальные аккаунты,
            модерация и защита от одновременного выбора места подключаются на
            сервере отдельно.
          </p>
          <a href="/community-cube" onClick={(event) => openCube(event)}>
            Открыть сохранённый прототип <Icon name="arrow" size={18} />
          </a>
        </aside>
      )}
      <dialog
        ref={workflow}
        className={`${styles.workflow} ${styles.website}`}
        aria-labelledby="cube-workflow-title"
        onCancel={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          setCubeOpen(false);
        }}
      >
        <header className={styles.workflowHeader}>
          <div>
            <BrandMark />
            <div>
              <strong>supcube</strong>
              <h2 id="cube-workflow-title">
                {hasPersonal ? 'Твоё место в общей истории' : 'Общий куб'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCubeOpen(false)}
            aria-label="Вернуться на главную"
          >
            На главную <Icon name="close" size={18} />
          </button>
        </header>
        {cubeMounted && (
          <CommunityCube
            embedded
            initialCreating={creationRequest > 0}
            creationRequest={creationRequest}
            focusRequest={focusRequest}
            onPlaced={setPlacement}
          />
        )}
      </dialog>
    </main>
  );
}
