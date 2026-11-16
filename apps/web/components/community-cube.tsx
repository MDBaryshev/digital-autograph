'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  communityCubeState,
  cubeCapacity,
  occupiedOnFace,
  isCubeCellOccupied,
} from '../lib/community-cube';
import { type Stroke } from '../lib/drawing';
import {
  names,
  inks,
  papers,
  format,
  paintMark,
  type PersonalMark,
  personalCubeSlot,
} from '../lib/community-cube-art';
import {
  CubeFaceNavigator,
  CubeZoomControls,
} from './community-cube-navigator';
import {
  focusCubeAutograph,
  facingCubeFace,
  zoomCubeCamera,
  desktopCubeMedia,
  type CubeCamera,
} from '../lib/community-cube-camera';
import { CanvasEditor } from './canvas-editor';
import { CommunityCubePlacePicker } from './community-cube-place-picker';
import { Icon } from './ui-icon';
import styles from './community-cube.module.css';
import { useCubeFaceTurn } from './use-cube-face-turn';
import { useCubeOverviewRotation } from './use-cube-overview-rotation';
import { useSmoothCubeCamera } from './use-smooth-cube-camera';

const faceNames = [
  'Лицевая',
  'Правая',
  'Обратная',
  'Левая',
  'Верхняя',
  'Нижняя',
];

function FaceCanvas({
  count,
  generation,
  face,
  personal,
  onChoose,
}: {
  count: number;
  generation: number;
  face: number;
  personal: PersonalMark | null;
  onChoose?: (id: number | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { perFace } = cubeCapacity(generation);
  let rows = Math.floor(Math.sqrt(perFace));
  while (perFace % rows) rows--;
  const columns = perFace / rows;
  const occupied = occupiedOnFace(
    count,
    perFace,
    face,
    personalCubeSlot(personal),
  );
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const size = 1000;
    const inset = 26;
    const gap = generation === 1 ? 14 : generation === 2 ? 6 : 2;
    const width = (size - inset * 2) / columns;
    const height = (size - inset * 2) / rows;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#e5d8c4';
    ctx.fillRect(0, 0, size, size);
    for (let cell = 0; cell < perFace; cell++) {
      const id = face * perFace + cell + 1;
      const filled = isCubeCellOccupied(id, count, personalCubeSlot(personal));
      const own = personalCubeSlot(personal) === id;
      const x = inset + (cell % columns) * width;
      const y = inset + Math.floor(cell / columns) * height;
      ctx.fillStyle = own
        ? '#f2d3b4'
        : filled
          ? papers[id % papers.length]!
          : '#ded1be';
      ctx.beginPath();
      ctx.roundRect(
        x + gap / 2,
        y + gap / 2,
        width - gap,
        height - gap,
        generation === 1 ? 12 : 3,
      );
      ctx.fill();
      ctx.strokeStyle = own ? '#a34427' : filled ? '#bda98b88' : '#b7a28566';
      ctx.lineWidth = own ? 6 : 1;
      ctx.stroke();
      if (filled) {
        ctx.save();
        ctx.translate(x + width * 0.07, y + height * 0.1);
        ctx.scale((width * 0.86) / 150, (height * 0.72) / 90);
        ctx.strokeStyle = own ? '#a34427' : inks[id % inks.length]!;
        paintMark(ctx, id, personal);
        ctx.restore();
        if (perFace <= 24) {
          ctx.font = `500 ${Math.min(14, width * 0.07)}px Manrope, sans-serif`;
          ctx.fillStyle = '#6b5946';
          ctx.fillText(
            own ? 'твой автограф' : `@${names[id % names.length]}`,
            x + width * 0.1,
            y + height * 0.88,
          );
        }
      } else if (perFace <= 144) {
        const centerX = x + width / 2,
          centerY = y + height / 2;
        ctx.strokeStyle = '#9b896f88';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(centerX - width * 0.06, centerY);
        ctx.lineTo(centerX + width * 0.06, centerY);
        ctx.moveTo(centerX, centerY - width * 0.06);
        ctx.lineTo(centerX, centerY + width * 0.06);
        ctx.stroke();
      }
    }
  }, [columns, rows, perFace, face, generation, count, personal]);
  return (
    <canvas
      ref={canvas}
      width={1000}
      height={1000}
      data-community-face={face}
      aria-label={`${faceNames[face]} грань: ${format(occupied)} из ${format(perFace)} ячеек занято`}
      onClick={
        onChoose
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - rect.left) / rect.width) * 1000 - 26;
              const y = ((event.clientY - rect.top) / rect.height) * 1000 - 26;
              if (x < 0 || y < 0 || x >= 948 || y >= 948) return;
              const cell =
                Math.floor(y / (948 / rows)) * columns +
                Math.floor(x / (948 / columns));
              const id = face * perFace + cell + 1;
              onChoose(
                isCubeCellOccupied(id, count, personalCubeSlot(personal))
                  ? id
                  : null,
              );
            }
          : undefined
      }
    />
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.modal}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.modalHeader}>
        <div>
          <span className={styles.eyebrow}>ОБЩИЙ КУБ · ДЕМО</span>
          <h2>{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function SignDialog({
  onClose,
  onSave,
  initialStrokes = [],
}: {
  onClose: () => void;
  onSave: (strokes: readonly Stroke[]) => void;
  initialStrokes?: readonly Stroke[];
}) {
  const strokes = useRef<readonly Stroke[]>(initialStrokes);
  const [hasMarks, setHasMarks] = useState(initialStrokes.length > 0);
  return (
    <Modal title="Твой почерк. Твоё место." onClose={onClose}>
      <p className={styles.modalIntro}>
        Шаг 1 из 2. Нарисуй автограф, затем выбери любое свободное место на
        общем кубе. Рисунок останется только в этой вкладке.
      </p>
      <CanvasEditor
        compact
        initialStrokes={initialStrokes}
        onDrawingChange={setHasMarks}
        onStrokesChange={(next) => {
          strokes.current = next;
        }}
      />
      <button
        type="button"
        className={styles.primary}
        disabled={!hasMarks}
        onClick={() => onSave(strokes.current)}
      >
        Выбрать место на кубе <Icon name="arrow" size={18} />
      </button>
    </Modal>
  );
}

export function CommunityCube({
  initialCreating = false,
  embedded = false,
  creationRequest = 0,
  focusRequest = 0,
  onPlaced,
}: {
  initialCreating?: boolean;
  embedded?: boolean;
  creationRequest?: number;
  focusRequest?: number;
  onPlaced?: () => void;
}) {
  const [count, setCount] = useState(96);
  const [personal, setPersonal] = useState<PersonalMark | null>(null);
  const ownSlot = personalCubeSlot(personal);
  const [draft, setDraft] = useState<readonly Stroke[]>([]);
  const [placing, setPlacing] = useState(false);
  const [rotation, setRotation] = useState({ x: -18, y: -28 });
  const [camera, setCamera] = useState<CubeCamera>({ zoom: 1, x: 0.5, y: 0.5 });
  const zoom = camera.zoom;
  const scene = useRef<HTMLDivElement>(null);
  const [face, setFace] = useState(0);
  const cameraMotion = useSmoothCubeCamera(camera, setCamera, {
    face,
    rotation,
    setRotation,
  });
  const [signing, setSigning] = useState(initialCreating);
  useEffect(() => {
    if (creationRequest > 0) setSigning(true);
  }, [creationRequest]);
  const [about, setAbout] = useState(false);
  const modalScene = useRef<HTMLDivElement>(null);
  const [inspecting, setInspecting] = useState(false);
  const [chosen, setChosen] = useState<number | null>(1);
  const [announcement, setAnnouncement] = useState('');
  const turn = useCubeFaceTurn({
    camera,
    face,
    setCamera,
    setFace,
    setRotation,
  });
  useEffect(() => {
    if (zoom > 1 || turn.phase) return;
    const nodes = [scene.current, modalScene.current].filter(
      (node): node is HTMLDivElement => node !== null,
    );
    const wheel = (event: WheelEvent) => {
      if (!window.matchMedia(desktopCubeMedia).matches) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      cameraMotion.animate((previous) =>
        zoomCubeCamera(
          previous,
          previous.zoom *
            Math.exp(-Math.max(-400, Math.min(400, delta)) * 0.003),
        ),
      );
    };
    nodes.forEach((node) =>
      node.addEventListener('wheel', wheel, { passive: false }),
    );
    return () =>
      nodes.forEach((node) => node.removeEventListener('wheel', wheel));
  }, [zoom, turn.phase, inspecting, cameraMotion.animate]);
  const state = communityCubeState(count);
  const percent = Math.round((count / state.total) * 100);
  const faceCount = occupiedOnFace(count, state.perFace, face, ownSlot);
  const firstOnFace = (index: number) => {
    const first = index * state.perFace + 1;
    return isCubeCellOccupied(first, count, ownSlot)
      ? first
      : ownSlot && Math.floor((ownSlot - 1) / state.perFace) === index
        ? ownSlot
        : null;
  };
  const filledFaces = faceNames.filter(
    (_, index) =>
      occupiedOnFace(count, state.perFace, index, ownSlot) === state.perFace,
  ).length;
  const overviewRotation = useCubeOverviewRotation({
    enabled: zoom === 1 && turn.phase === null && cameraMotion.stage === null,
    rotation,
    onRotate: (next) => {
      setRotation(next);
      const nextFace = facingCubeFace(next);
      setFace(nextFace);
      if (nextFace !== face) setChosen(firstOnFace(nextFace));
    },
  });
  const overviewProps =
    zoom === 1
      ? {
          role: 'group' as const,
          tabIndex: 0,
          'aria-label':
            'Общий вид куба. Вращайте перетаскиванием или стрелками.',
          'data-overview': true,
          'data-rotating':
            (!cameraMotion.stage && overviewRotation.dragging) || undefined,
          ...overviewRotation.handlers,
        }
      : {};
  const viewFace = (index: number) => {
    cameraMotion.cancel();
    turn.turnTo(index, () => setChosen(firstOnFace(index)));
  };
  const preset = (generation: number) => {
    cameraMotion.cancel();
    turn.cancel();
    const capacity = cubeCapacity(generation);
    const next =
      generation === 1
        ? 18
        : capacity.perFace + Math.floor(capacity.perFace * 5 * 0.6);
    setCount(next);
    setPersonal(null);
    setDraft([]);
    setCamera({ zoom: 1, x: 0.5, y: 0.5 });
    setChosen(1);
    setRotation({ x: -18, y: -28 });
    setFace(0);
    setAnnouncement(
      `Демосценарий: куб ${generation}, ${format(next)} автографов.`,
    );
  };
  const grow = () => {
    cameraMotion.cancel();
    turn.cancel();
    setCamera({ zoom: 1, x: 0.5, y: 0.5 });
    setCount(state.total);
    setFace(0);
    setRotation({ x: -18, y: -28 });
    setAnnouncement(
      `Куб ${state.generation} заполнен. Все ${format(state.total)} автографа теперь на лицевой грани куба ${state.generation + 1}.`,
    );
  };
  const findMine = () => {
    if (!personal) return;
    cameraMotion.cancel();
    turn.cancel();
    const target = focusCubeAutograph(ownSlot!, state.generation);
    turn.turnTo(target.face, () => setChosen(ownSlot!), target.camera);
    setAnnouncement('Твой автограф в центре. Можно приблизить ещё сильнее.');
    if (!inspecting && !window.matchMedia(desktopCubeMedia).matches)
      scene.current?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  };
  const placeDraft = (slot: number) => {
    if (
      personal ||
      !draft.length ||
      !Number.isSafeInteger(slot) ||
      slot < 1 ||
      slot > state.total ||
      isCubeCellOccupied(slot, count)
    )
      return;
    cameraMotion.cancel();
    turn.cancel();
    const id = count + 1;
    setPersonal({ id, slot, strokes: draft });
    onPlaced?.();
    setCount(id);
    setPlacing(false);
    setDraft([]);
    const next = communityCubeState(id);
    const target = focusCubeAutograph(slot, next.generation);
    turn.turnTo(target.face, () => setChosen(slot), target.camera);
    setAnnouncement(
      next.generation > state.generation
        ? 'Куб заполнен! Твой автограф сохранился на лицевой грани следующего куба.'
        : `Твой автограф на выбранном месте № ${slot}.`,
    );
    if (!window.matchMedia(desktopCubeMedia).matches)
      scene.current?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  };
  const focusAction = useRef(findMine);
  focusAction.current = findMine;
  useEffect(() => {
    if (focusRequest > 0) focusAction.current();
  }, [focusRequest]);
  const cubeOverview = (
    <>
      <span className={styles.watermark} aria-hidden="true">
        {String(state.generation).padStart(2, '0')}
      </span>
      <div
        className={styles.cubeShadow}
        style={{ transform: 'translateX(-50%)' }}
      />
      <div className={styles.cubeAnchor} key={state.generation}>
        <div
          className={styles.cube}
          data-community-cube
          data-generation={state.generation}
          style={
            {
              '--rx': `${rotation.x}deg`,
              '--ry': `${rotation.y}deg`,
              '--zoom': 1,
            } as CSSProperties
          }
        >
          {faceNames.map((name, index) => (
            <div
              key={name}
              className={`${styles.face} ${styles[`face${index}`]}`}
              data-active-face={face === index || undefined}
            >
              <FaceCanvas
                count={count}
                generation={state.generation}
                face={index}
                personal={personal}
              />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.scaleNote}>
        <span>ОБЪЁМНЫЙ ВИД</span>
        <small>Потяни, чтобы вращать · приближай до ×64</small>
      </div>
    </>
  );
  const Root = embedded ? 'div' : 'main';
  return (
    <Root
      className={styles.page}
      data-community-workspace
      data-embedded={embedded || undefined}
    >
      <div className={styles.topline}>
        <a href="/">
          <Icon name="arrow" size={16} /> К стенам авторов
        </a>
        <span>
          <i /> Локальный концепт · демоданные
        </span>
      </div>
      <section className={styles.hero} aria-labelledby="community-heading">
        <div className={styles.intro}>
          <label className={styles.desktopPreset}>
            Демо-куб
            <select
              aria-label="Демо-куб"
              value={state.generation}
              onChange={(event) => preset(Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((generation) => (
                <option key={generation} value={generation}>
                  № {generation} · {format(cubeCapacity(generation).total)} мест
                </option>
              ))}
            </select>
          </label>
          <span className={styles.eyebrow}>ОДИН КУБ. ОБЩАЯ ИСТОРИЯ.</span>
          <h1 id="community-heading">
            У каждого
            <br />
            свой почерк.
            <br />
            <em>Место — общее.</em>
          </h1>
          <p className={styles.lead}>
            Большой куб из маленьких автографов. Он растёт вместе с сообществом
            — и бережно сохраняет каждый след.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              if (personal) findMine();
              else setSigning(true);
            }}
          >
            <Icon name="pen" size={19} />
            {personal
              ? 'К моему автографу'
              : embedded
                ? 'Создать автограф'
                : 'Оставить свой автограф'}
            <Icon name="arrow" size={18} />
          </button>
          <span className={styles.ctaHint}>
            Попробуй без регистрации. Это демо.
          </span>
          <div className={styles.social}>
            <div className={styles.avatars} aria-hidden="true">
              {['М', 'А', 'Н', 'Л', 'С'].map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
            <p>
              <strong>{format(count)} разных следов</strong>
              <br />в демонстрационном сообществе
            </p>
          </div>
        </div>
        <div className={styles.exhibit}>
          <div className={styles.exhibitHeader}>
            <span>
              <i /> ОБЩИЙ КУБ
              <span className={styles.desktopStats}>
                {format(count)} / {format(state.total)} автографов
              </span>
            </span>
            <span>
              № {String(state.generation).padStart(2, '0')} / 06 ГРАНЕЙ
            </span>
          </div>
          <div
            {...overviewProps}
            ref={scene}
            className={styles.scene}
            data-closeup={zoom > 1 || undefined}
            data-transition={turn.phase || undefined}
            data-zoom-stage={cameraMotion.stage || undefined}
            inert={turn.phase !== null}
          >
            {zoom > 1 ? (
              <CubeFaceNavigator
                count={count}
                generation={state.generation}
                face={face}
                personal={personal}
                camera={camera}
                setCamera={cameraMotion.jump}
                animateCamera={cameraMotion.animate}
                onChoose={setChosen}
              />
            ) : (
              cubeOverview
            )}
          </div>
          <CubeZoomControls
            camera={camera}
            setCamera={cameraMotion.animate}
            personal={personal}
            onFind={findMine}
            disabled={turn.phase !== null}
          />
          <div
            className={styles.faceTabs}
            role="group"
            aria-label="Выбор грани"
          >
            {faceNames.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={face === index}
                onClick={() => viewFace(index)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className={styles.exhibitBottom}>
            <div>
              <span className={styles.eyebrow}>
                КУБ {String(state.generation).padStart(2, '0')}
              </span>
              <p>
                <strong>{format(count)}</strong>
                <span> / {format(state.total)} автографов</span>
              </p>
            </div>
            <div className={styles.progressBox}>
              <div>
                <span>{filledFaces} из 6 граней заполнены</span>
                <strong>{percent}%</strong>
              </div>
              <progress
                value={count}
                max={state.total}
                aria-label="Заполнение общего куба"
              />
            </div>
          </div>
        </div>
      </section>
      <div className={styles.liveRow}>
        <p>
          <span className={styles.tinyCube} />
          <strong>
            {state.inherited
              ? `${format(state.inherited)} первых автографов уже на лицевой грани.`
              : 'Самая первая глава: по четыре автографа на каждой стороне.'}
          </strong>
          <span> Предыдущие участники остаются частью нового куба.</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setChosen(firstOnFace(face));
            setInspecting(true);
          }}
        >
          Рассмотреть грань <Icon name="arrow" size={16} />
        </button>
      </div>
      <section className={styles.growth} aria-labelledby="growth-title">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>
              БОЛЬШЕ ЛЮДЕЙ — БОЛЬШЕ ИСТОРИЯ
            </span>
            <h2 id="growth-title">Куб растёт. Автографы остаются.</h2>
          </div>
          <p>
            Заполнили все шесть граней — появился новый куб.
            <br />
            Весь предыдущий теперь помещается на одной его стороне.
          </p>
        </div>
        <div className={styles.generations}>
          {[1, 2, 3, 4].map((generation) => {
            const capacity = cubeCapacity(generation);
            return (
              <button
                key={generation}
                type="button"
                aria-pressed={state.generation === generation}
                onClick={() => preset(generation)}
                className={styles.generationCard}
              >
                <span className={styles.cardNumber}>
                  0{generation}{' '}
                  <span>
                    {state.generation === generation
                      ? 'СМОТРИМ СЕЙЧАС'
                      : 'ДЕМО-СЦЕНАРИЙ'}
                  </span>
                </span>
                <span className={styles.miniScene} aria-hidden="true">
                  <span
                    className={styles.miniCube}
                    style={
                      {
                        '--mini-size': `${32 + generation * 11}px`,
                        '--mini-grid': `${100 / (generation === 1 ? 2 : generation === 2 ? 6 : generation === 3 ? 12 : 24)}%`,
                      } as CSSProperties
                    }
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <strong>
                  {format(capacity.total)}
                  <span>мест</span>
                </strong>
                <span className={styles.cardCaption}>
                  {format(capacity.perFace)} на каждой грани
                </span>
                <span className={styles.cardFooter}>
                  {generation === 1
                    ? 'Начинается с 2 × 2'
                    : `Все ${format(cubeCapacity(generation - 1).total)} прошлых — спереди`}
                  <Icon name="arrow" size={15} />
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.demoToolbar}>
          <button
            type="button"
            className={styles.desktopHelp}
            onClick={() => setAbout(true)}
          >
            Как растёт куб?
          </button>
          <p>
            <span>Попробуй момент роста</span> Заполни оставшиеся места
            примерами и посмотри, как рождается следующий куб.
          </p>
          <button type="button" disabled={state.generation >= 4} onClick={grow}>
            Заполнить куб и вырастить следующий <Icon name="arrow" size={17} />
          </button>
        </div>
      </section>
      <section className={styles.manifesto}>
        <span>НИ ОДИН ПОЧЕРК НЕ ТЕРЯЕТСЯ.</span>
        <p>
          Не просто цифра.
          <br />
          <em>Люди, оставившие след.</em>
        </p>
        <div>
          На настоящем общем кубе каждый автограф будет принадлежать
          подтверждённому участнику. Здесь — примеры для проверки идеи, а не
          статистика пользователей supcube.
        </div>
      </section>
      <p className={styles.announcement} role="status" aria-live="polite">
        {announcement}
      </p>
      {about && (
        <Modal title="Один куб. Общая история." onClose={() => setAbout(false)}>
          <p className={styles.modalIntro}>
            Первый куб — 24 места: по 4 автографа на каждой из шести граней.
            Когда все места заняты, появляется следующий куб. Весь предыдущий
            помещается на его лицевой стороне.
          </p>
          <p className={styles.modalIntro}>
            24 → 144 → 864 → 5 184 места. Каждый автограф остаётся частью
            следующего куба и учитывается один раз.
          </p>
          <p className={styles.modalIntro}>
            На компьютере колесо приближает. В общем виде перетаскивание вращает
            куб, в приближении — перемещает грань. Кнопки сторон сначала
            отдаляют, затем поворачивают куб. «К моему автографу» находит твою
            ячейку.
          </p>
          <p className={styles.modalIntro}>
            Здесь демонстрационные автографы и счётчики. Свой рисунок можно
            добавить без регистрации; он останется в этой вкладке.
          </p>
        </Modal>
      )}
      {signing && (
        <SignDialog
          initialStrokes={draft}
          onClose={() => setSigning(false)}
          onSave={(strokes) => {
            setDraft(strokes);
            setSigning(false);
            setPlacing(true);
          }}
        />
      )}
      {placing && (
        <Modal
          title="Выбери своё место на кубе"
          onClose={() => setPlacing(false)}
        >
          <CommunityCubePlacePicker
            count={count}
            generation={state.generation}
            strokes={draft}
            onPlace={placeDraft}
            onBack={() => {
              setPlacing(false);
              setSigning(true);
            }}
          />
        </Modal>
      )}
      {inspecting && (
        <Modal
          title={`${faceNames[face]} грань · куб ${state.generation}`}
          onClose={() => setInspecting(false)}
        >
          <p className={styles.modalIntro}>
            {format(faceCount)} из {format(state.perFace)} ячеек занято. Нажми
            на миниячейку, чтобы найти её номер.
          </p>
          <div
            {...overviewProps}
            ref={modalScene}
            className={`${styles.inspectGrid} ${styles.scene}`}
            data-transition={turn.phase || undefined}
            data-zoom-stage={cameraMotion.stage || undefined}
            inert={turn.phase !== null}
          >
            {zoom > 1 ? (
              <CubeFaceNavigator
                count={count}
                generation={state.generation}
                face={face}
                personal={personal}
                camera={camera}
                setCamera={cameraMotion.jump}
                animateCamera={cameraMotion.animate}
                onChoose={setChosen}
              />
            ) : (
              cubeOverview
            )}
          </div>
          <CubeZoomControls
            camera={camera}
            setCamera={cameraMotion.animate}
            personal={personal}
            onFind={findMine}
            disabled={turn.phase !== null}
          />
          <div className={styles.inspectCaption}>
            {chosen ? (
              <>
                <strong>
                  {ownSlot === chosen
                    ? 'Твой автограф'
                    : `Автограф № ${format(chosen)}`}
                </strong>
                <span>
                  {ownSlot === chosen
                    ? 'Нарисован тобой в этой вкладке.'
                    : `@${names[chosen % names.length]} · демонстрационный участник`}
                </span>
              </>
            ) : (
              <>
                <strong>Здесь ещё есть место.</strong>
                <span>У следующего участника будет своя миниячейка.</span>
              </>
            )}
          </div>
          <div className={styles.modalFaceTabs}>
            {faceNames.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={face === index}
                onClick={() => {
                  viewFace(index);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Root>
  );
}
