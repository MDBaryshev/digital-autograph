'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CommunityCubeApiError,
  communityCubeLiveApi,
  communityCubePath,
  withCubeDeadline,
  type CubePlacement,
  type CubePlacementRequest,
  type PublishedCube,
} from '../lib/community-cube-live-api';
import { wallClaimApi, type ReadyAutographChoice } from '../lib/wall-claim-api';
import { autographIdParams } from '@digital-autograph/contracts';
import { AccountSession } from './account-session';
import {
  FirstUseActionNotice,
  needsFirstUseConfirmation,
} from './first-use-action-notice';
import { useLocale } from './locale-provider';
import { ReadyAutographPicker } from './ready-autograph-picker';
import { Icon } from './ui-icon';
import styles from './community-cube-live.module.css';

type CubeState =
  | { kind: 'loading' | 'closed' | 'failed' }
  | { kind: 'open'; cube: PublishedCube };

type MemberState =
  | { kind: 'loading' | 'anonymous' | 'failed' }
  | { kind: 'placed'; placement: CubePlacement }
  | { kind: 'signed-in'; choices: ReadyAutographChoice[] };

const faceNames = [
  'Front face',
  'Right face',
  'Back face',
  'Left face',
  'Top face',
  'Bottom face',
] as const;

const pageSize = 24;

function hasStatus(error: unknown, status: number) {
  return error instanceof CommunityCubeApiError && error.status === status;
}

async function loadCube(
  apiOrigin: string,
  signal: AbortSignal,
): Promise<CubeState> {
  try {
    return {
      kind: 'open',
      cube: await communityCubeLiveApi(apiOrigin).cube(signal),
    };
  } catch (error) {
    return { kind: hasStatus(error, 404) ? 'closed' : 'failed' };
  }
}

async function loadPlacement(
  apiOrigin: string,
  signal: AbortSignal,
): Promise<MemberState> {
  try {
    const placement = await communityCubeLiveApi(apiOrigin).placement(signal);
    return placement
      ? { kind: 'placed', placement }
      : { kind: 'signed-in', choices: [] };
  } catch (error) {
    return { kind: hasStatus(error, 401) ? 'anonymous' : 'failed' };
  }
}

const conflictMessages: Record<string, string> = {
  CUBE_GENERATION_CHANGED: 'The cube grew. Choose a place on the current cube.',
  CUBE_CELL_OCCUPIED: 'Someone took that place. Choose another place.',
  CUBE_ALREADY_PLACED: 'Your account already has a place in the cube.',
  CUBE_FULL: 'The cube is full. You can still view the autographs.',
  CUBE_REQUEST_CONFLICT:
    'That request has already been used. Choose a place again.',
  AUTOGRAPH_NOT_AVAILABLE: 'That autograph is no longer available to publish.',
};

export function CommunityCubeLive({ apiOrigin }: { apiOrigin: string }) {
  const { t, locale } = useLocale();
  const [cubeState, setCubeState] = useState<CubeState>({ kind: 'loading' });
  const [member, setMember] = useState<MemberState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(true);
  const [revision, setRevision] = useState(0);
  const [face, setFace] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{
    generation: number;
    cell: number;
  } | null>(null);
  const [selectedAutograph, setSelectedAutograph] = useState('');
  const [mutating, setMutating] = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    urgent: boolean;
  } | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const retryRequest = useRef<CubePlacementRequest | null>(null);

  useEffect(() => () => mutation.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      const [cube, owner] = await Promise.all([
        loadCube(apiOrigin, signal),
        loadPlacement(apiOrigin, signal),
      ]);
      if (signal.aborted) return;
      setCubeState(cube);
      let nextMember = owner;
      if (cube.kind === 'open' && owner.kind === 'signed-in') {
        try {
          const choices = await withCubeDeadline(signal, (requestSignal) =>
            wallClaimApi(apiOrigin).readyAutographs(requestSignal),
          );
          nextMember = {
            kind: 'signed-in',
            choices: choices.filter(
              (choice) =>
                autographIdParams.safeParse({ id: choice.id }).success &&
                (choice.source === 'canvas' || choice.source === 'photo') &&
                Number.isFinite(Date.parse(choice.moderatedAt)),
            ),
          };
        } catch {
          nextMember = { kind: 'failed' };
        }
      }
      if (signal.aborted) return;
      setMember(nextMember);
      setRefreshing(false);
    })();
    return () => controller.abort();
  }, [apiOrigin, revision]);

  const cube = cubeState.kind === 'open' ? cubeState.cube : null;
  const placement = member.kind === 'placed' ? member.placement : null;
  const choices = member.kind === 'signed-in' ? member.choices : [];
  const occupied = new Set(cube?.occupiedCells);
  const availableChoice = choices.some(({ id }) => selectedAutograph === id);
  const perFace = cube ? cube.capacity / faceNames.length : 0;
  const pages = Math.ceil(perFace / pageSize);
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  const first = face * perFace + currentPage * pageSize + 1;
  const last = Math.min(first + pageSize - 1, (face + 1) * perFace);
  const cells = cube
    ? Array.from({ length: last - first + 1 }, (_, index) => first + index)
    : [];
  const selected =
    cube &&
    selectedCell?.generation === cube.generation &&
    cells.includes(selectedCell.cell) &&
    !occupied.has(selectedCell.cell)
      ? selectedCell
      : null;
  const locked = refreshing || mutating;
  const formatter = new Intl.NumberFormat(locale);

  function refresh() {
    setRefreshing(true);
    setRevision((current) => current + 1);
  }

  function showFace(index: number) {
    setFace(index);
    setPage(0);
    setSelectedCell(null);
  }

  function showPage(index: number) {
    setPage(index);
    setSelectedCell(null);
  }

  function showPlacement() {
    if (!placement || !cube || placement.cell > cube.capacity) return;
    const slotIndex = placement.cell - 1;
    showFace(Math.floor(slotIndex / perFace));
    showPage(Math.floor((slotIndex % perFace) / pageSize));
    document.getElementById('cube-cells')?.focus();
  }

  async function changePlacement(
    run: (signal: AbortSignal) => Promise<unknown>,
    success: string,
  ) {
    if (mutation.current || refreshing) return;
    const controller = new AbortController();
    mutation.current = controller;
    setMutating(true);
    setNotice(null);
    setNeedsConfirmation(false);
    try {
      await run(controller.signal);
      if (controller.signal.aborted) return;
      retryRequest.current = null;
      setSelectedCell(null);
      setConfirmWithdrawal(false);
      setNotice({ text: success, urgent: false });
      refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (needsFirstUseConfirmation(error)) {
        setNeedsConfirmation(true);
        return;
      }
      const code = error instanceof CommunityCubeApiError ? error.code : '';
      const conflict = Object.hasOwn(conflictMessages, code)
        ? conflictMessages[code]
        : undefined;
      if (conflict) {
        retryRequest.current = null;
        setSelectedCell(null);
      }
      setNotice({
        text:
          conflict ??
          'Could not confirm the change. Check your placement and try again.',
        urgent: true,
      });
      refresh();
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (!controller.signal.aborted) setMutating(false);
    }
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !availableChoice || locked) return;
    const previous = retryRequest.current;
    const request =
      previous?.generation === selected.generation &&
      previous.cell === selected.cell &&
      previous.autographId === selectedAutograph
        ? previous
        : {
            ...selected,
            autographId: selectedAutograph,
            requestId: crypto.randomUUID(),
          };
    retryRequest.current = request;
    void changePlacement(
      (signal) => communityCubeLiveApi(apiOrigin).publish(request, signal),
      'Your autograph is published.',
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('Community cube')}</h1>
          {cube && (
            <p>
              {t('Cube {generation} · {used} of {capacity} places occupied', {
                generation: formatter.format(cube.generation),
                used: formatter.format(occupied.size),
                capacity: formatter.format(cube.capacity),
              })}
            </p>
          )}
        </div>
        <a className="actionLink" href="/community-cube">
          {t('Try the cube demo')}
        </a>
      </header>

      <div className={styles.layout} aria-busy={refreshing}>
        <section className={styles.facePanel} aria-labelledby="cube-cells">
          {cube ? (
            <>
              <div
                className={styles.faces}
                role="group"
                aria-label={t('Choose a cube face')}
              >
                {faceNames.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={face === index}
                    onClick={() => showFace(index)}
                  >
                    {t(name)}
                  </button>
                ))}
              </div>
              <div className={styles.faceHeading}>
                <h2 id="cube-cells" tabIndex={-1}>
                  {t(faceNames[face]!)}
                </h2>
                <button
                  className={styles.secondary}
                  type="button"
                  onClick={refresh}
                  disabled={locked}
                >
                  {t('Refresh cube')}
                </button>
              </div>
              <ul
                className={styles.cells}
                data-compact={perFace <= 4 || undefined}
              >
                {cells.map((cell) => {
                  const filled = occupied.has(cell);
                  const yours = placement?.cell === cell;
                  const label = t(
                    yours
                      ? 'Place {cell} · Your autograph'
                      : filled
                        ? 'Place {cell} · Occupied'
                        : 'Place {cell} · Free',
                    { cell: formatter.format(cell) },
                  );
                  return (
                    <li key={cell}>
                      {!filled && !placement && choices.length > 0 ? (
                        <button
                          type="button"
                          aria-label={label}
                          aria-pressed={selected?.cell === cell}
                          disabled={locked}
                          onClick={() =>
                            setSelectedCell({
                              generation: cube.generation,
                              cell,
                            })
                          }
                        >
                          <Icon name="plus" size={18} />
                          <span>{formatter.format(cell)}</span>
                        </button>
                      ) : (
                        <div
                          role="img"
                          aria-label={label}
                          data-filled={filled || undefined}
                          data-own={yours || undefined}
                        >
                          {filled ? (
                            <img
                              key={revision}
                              src={communityCubeLiveApi(apiOrigin).media(cell)}
                              alt=""
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                          ) : (
                            <Icon name="plus" size={18} />
                          )}
                          <span>{formatter.format(cell)}</span>
                          {yours && (
                            <span className={styles.ownMark}>
                              <Icon name="check" size={14} />
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {pages > 1 && (
                <nav
                  className={styles.pagination}
                  aria-label={t('Pages of cube places')}
                >
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => showPage(currentPage - 1)}
                  >
                    {t('Previous')}
                  </button>
                  <span>
                    {t('Page {current} of {total}', {
                      current: formatter.format(currentPage + 1),
                      total: formatter.format(pages),
                    })}
                  </span>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={currentPage + 1 >= pages}
                    onClick={() => showPage(currentPage + 1)}
                  >
                    {t('Next')}
                  </button>
                </nav>
              )}
            </>
          ) : (
            <>
              <h2 id="cube-cells">
                {t(
                  cubeState.kind === 'closed'
                    ? 'The community cube is closed'
                    : 'Cube places',
                )}
              </h2>
              {cubeState.kind === 'loading' && (
                <p role="status">{t('Loading the cube…')}</p>
              )}
              {cubeState.kind === 'closed' && (
                <p>
                  {t(
                    'You can explore the cube in the demo while publication is closed.',
                  )}
                </p>
              )}
              {cubeState.kind === 'failed' && (
                <p role="alert">
                  {t(
                    'The cube could not be loaded. Check your connection and try again.',
                  )}
                </p>
              )}
              {cubeState.kind !== 'loading' && (
                <button
                  className={styles.secondary}
                  type="button"
                  onClick={refresh}
                  disabled={locked}
                >
                  {t('Refresh cube')}
                </button>
              )}
            </>
          )}
        </section>

        <aside
          className={styles.account}
          aria-label={t('Your place in the cube')}
        >
          {notice && (
            <p role={notice.urgent ? 'alert' : 'status'}>{t(notice.text)}</p>
          )}
          {needsConfirmation && (
            <FirstUseActionNotice returnTo={communityCubePath} />
          )}
          {member.kind === 'loading' && (
            <p role="status">{t('Checking sign-in…')}</p>
          )}
          {member.kind === 'anonymous' && (
            <AccountSession
              apiOrigin={apiOrigin}
              returnTo={communityCubePath}
            />
          )}
          {member.kind === 'failed' && (
            <p role="alert">
              {t(
                'Your cube placement could not be loaded. Refresh the cube to try again.',
              )}
            </p>
          )}
          {placement && (
            <section>
              <h2>{t('Your place in the cube')}</h2>
              <p>
                {t('Your autograph is saved at place {cell}.', {
                  cell: formatter.format(placement.cell),
                })}
              </p>
              <div className={styles.actions}>
                {cube && (
                  <button type="button" onClick={showPlacement}>
                    {t('Find my autograph')}
                  </button>
                )}
                {!confirmWithdrawal && (
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={locked}
                    onClick={() => setConfirmWithdrawal(true)}
                  >
                    {t('Withdraw autograph')}
                  </button>
                )}
              </div>
              {confirmWithdrawal && (
                <div className={styles.confirmWithdrawal}>
                  <p>
                    {t(
                      'Withdraw this autograph from the cube? It will stay in your account.',
                    )}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        void changePlacement(
                          (signal) =>
                            communityCubeLiveApi(apiOrigin).withdraw(
                              placement.id,
                              signal,
                            ),
                          'Your autograph was withdrawn from the cube.',
                        )
                      }
                    >
                      {t('Confirm withdrawal')}
                    </button>
                    <button
                      className={styles.secondary}
                      type="button"
                      disabled={locked}
                      onClick={() => setConfirmWithdrawal(false)}
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          {cube && member.kind === 'signed-in' && (
            <>
              {choices.length === 0 ? (
                <section>
                  <h2>{t('Publish an autograph')}</h2>
                  <p>
                    {t(
                      'You can publish an autograph after it passes moderation.',
                    )}
                  </p>
                  <div className="linkActions">
                    <a href="/autograph/create">
                      {t('Create a digital autograph')}
                    </a>
                    <a href="/me/autographs">{t('My autographs')}</a>
                  </div>
                </section>
              ) : (
                <form onSubmit={publish}>
                  <ReadyAutographPicker
                    apiOrigin={apiOrigin}
                    choices={choices}
                    selectedId={selectedAutograph}
                    onSelect={setSelectedAutograph}
                  />
                  <p role="status">
                    {selected
                      ? t('Selected place {cell}', {
                          cell: formatter.format(selected.cell),
                        })
                      : t('Choose a free place on any face.')}
                  </p>
                  <p>
                    {t(
                      'Publishing will show this approved autograph on the public cube. You can withdraw it later.',
                    )}
                  </p>
                  <button
                    type="submit"
                    disabled={locked || !selected || !availableChoice}
                  >
                    {t(mutating ? 'Publishing…' : 'Publish autograph')}
                  </button>
                </form>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
