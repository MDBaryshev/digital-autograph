// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { CommunityCube } from './community-cube';

vi.mock('./canvas-editor', () => ({
  CanvasEditor: ({
    onDrawingChange,
    onStrokesChange,
  }: {
    onDrawingChange: (value: boolean) => void;
    onStrokesChange: (value: unknown) => void;
  }) => (
    <button
      onClick={() => {
        onDrawingChange(true);
        onStrokesChange([
          {
            points: [
              { x: 100, y: 100, pressure: 0.5 },
              { x: 250, y: 180, pressure: 0.5 },
            ],
          },
        ]);
      }}
    >
      Нарисовать тестовый автограф
    </button>
  ),
}));

beforeEach(() => {
  const context = new Proxy({}, { get: () => vi.fn(), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 600,
    height: 400,
    right: 600,
    bottom: 400,
    toJSON: () => ({}),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function viewer() {
  return screen.getByRole('group', { name: /Приближенная грань/ });
}

it('rotates the overview by dragging and zooms into the face now facing the user', () => {
  render(<CommunityCube />);
  const overview = screen.getByRole('group', { name: /Общий вид куба/ });
  expect(
    overview
      .querySelector('[data-active-face] canvas')!
      .getAttribute('data-community-face'),
  ).toBe('0');
  fireEvent.pointerDown(overview, {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerMove(overview, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 440,
    clientY: 210,
  });
  const object = document.querySelector<HTMLElement>('[data-community-cube]')!;
  expect(parseFloat(object.style.getPropertyValue('--ry'))).toBeCloseTo(63.2);
  expect(parseFloat(object.style.getPropertyValue('--rx'))).toBeCloseTo(-21.2);
  expect(overview.hasAttribute('data-rotating')).toBe(true);
  expect(overview.querySelectorAll('[data-active-face]')).toHaveLength(1);
  expect(
    overview
      .querySelector('[data-active-face] canvas')!
      .getAttribute('data-community-face'),
  ).toBe('3');
  expect(
    screen.getByRole('button', { name: 'Левая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.pointerUp(overview, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 440,
    clientY: 210,
  });
  expect(overview.hasAttribute('data-rotating')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
  expect(viewer().getAttribute('data-face')).toBe('3');
});

it('ignores canceled overview drags and keeps touch page scrolling available', () => {
  render(<CommunityCube />);
  const overview = screen.getByRole('group', { name: /Общий вид куба/ });
  const object = document.querySelector<HTMLElement>('[data-community-cube]')!;
  fireEvent.pointerDown(overview, {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerCancel(overview, { pointerId: 1, pointerType: 'mouse' });
  fireEvent.pointerMove(overview, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 500,
    clientY: 300,
  });
  expect(object.style.getPropertyValue('--ry')).toBe('-28deg');
  const touch = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 2,
    pointerType: 'touch',
    clientX: 200,
    clientY: 200,
  });
  fireEvent(overview, touch);
  fireEvent.pointerMove(overview, {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 205,
    clientY: 300,
  });
  expect(touch.defaultPrevented).toBe(false);
  expect(object.style.getPropertyValue('--ry')).toBe('-28deg');
  fireEvent.pointerCancel(overview, { pointerId: 2, pointerType: 'touch' });
  fireEvent.keyDown(overview, { key: 'ArrowRight' });
  expect(object.style.getPropertyValue('--ry')).toBe('-16deg');
});
function addMark() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Оставить свой автограф' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Нарисовать тестовый автограф' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Выбрать место на кубе/ }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ячейка № 97 — свободна' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Разместить здесь/ }));
}

it('focuses the personal cell immediately and finds it again after a face change and cube growth', () => {
  render(<CommunityCube />);
  expect(
    (
      screen.getByRole('button', {
        name: 'К моему автографу',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  addMark();
  expect(viewer().getAttribute('data-face')).toBe('4');
  expect(Number(viewer().getAttribute('data-camera-x'))).toBeCloseTo(0.105);
  fireEvent.click(screen.getByRole('button', { name: 'Правая' }));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Правая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(
    screen.getByRole('button', { name: /Заполнить куб и вырастить/ }),
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'К моему автографу' })[0]!,
  );
  expect(viewer().getAttribute('data-face')).toBe('0');
  expect(Number(viewer().getAttribute('data-camera-y'))).toBeCloseTo(0.6975);
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeGreaterThan(10);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('requires a free cell choice during creation and keeps a nonsequential choice after growth', () => {
  render(<CommunityCube initialCreating />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Нарисовать тестовый автограф' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Выбрать место на кубе/ }),
  );
  const confirm = screen.getByRole('button', {
    name: /Разместить здесь/,
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Лицевая.*свободно/ }));
  const occupied = screen.getByRole('button', {
    name: 'Ячейка № 1 — занята',
  }) as HTMLButtonElement;
  expect(occupied.disabled).toBe(true);
  fireEvent.click(occupied);
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Нижняя.*свободно/ }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Ячейка № 144 — свободна' }),
  );
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('97 / 144 автографов')).toBeTruthy();
  expect(viewer().getAttribute('data-face')).toBe('5');
  expect(Number(viewer().getAttribute('data-camera-x'))).toBeCloseTo(0.895);
  expect(screen.getByLabelText('Грань 6: 1 из 24 ячеек занято')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: /Заполнить куб и вырастить/ }),
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'К моему автографу' })[0]!,
  );
  expect(viewer().getAttribute('data-face')).toBe('0');
  expect(Number(viewer().getAttribute('data-camera-x'))).toBeCloseTo(0.9345);
  expect(Number(viewer().getAttribute('data-camera-y'))).toBeCloseTo(0.9345);
});

it('keeps the drawing when returning from cell selection and does not place it when canceled', () => {
  render(<CommunityCube initialCreating />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Нарисовать тестовый автограф' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Выбрать место на кубе/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Изменить автограф' }));
  const next = screen.getByRole('button', {
    name: /Выбрать место на кубе/,
  }) as HTMLButtonElement;
  expect(next.disabled).toBe(false);
  fireEvent.click(next);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('96 / 144 автографов')).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'К моему автографу',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it('allows 64x zoom and returns to a whole cube with one button', () => {
  render(<CommunityCube />);
  fireEvent.change(screen.getByRole('slider', { name: 'Масштаб грани' }), {
    target: { value: '6' },
  });
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBe(64);
  expect(
    (
      screen.getByRole('button', {
        name: 'Увеличить масштаб',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Куб целиком' }));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(document.querySelector('[data-community-cube]')).toBeTruthy();
});

it('pans the face rather than rotating it and preserves the cursor anchor on explicit Ctrl+wheel zoom', () => {
  render(<CommunityCube />);
  fireEvent.change(screen.getByRole('slider', { name: 'Масштаб грани' }), {
    target: { value: '2' },
  });
  const node = viewer();
  fireEvent.pointerDown(node, { pointerId: 1, clientX: 300, clientY: 200 });
  fireEvent.pointerMove(node, { pointerId: 1, clientX: 350, clientY: 220 });
  fireEvent.pointerUp(node, { pointerId: 1, clientX: 350, clientY: 220 });
  expect(Number(node.getAttribute('data-camera-x'))).toBeLessThan(0.5);
  expect(node.getAttribute('data-face')).toBe('0');
  const before = {
    x: Number(node.getAttribute('data-camera-x')),
    zoom: Number(node.getAttribute('data-camera-zoom')),
  };
  fireEvent.wheel(node, {
    clientX: 400,
    clientY: 200,
    deltaY: -100,
    ctrlKey: true,
  });
  const after = {
    x: Number(node.getAttribute('data-camera-x')),
    zoom: Number(node.getAttribute('data-camera-zoom')),
  };
  expect(after.zoom).toBeGreaterThan(before.zoom);
  expect(after.x + 100 / 288 / after.zoom).toBeCloseTo(
    before.x + 100 / 288 / before.zoom,
  );
});

it('zooms with two fingers and clears canceled touches', () => {
  render(<CommunityCube />);
  fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
  const node = viewer();
  fireEvent.pointerDown(node, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 250,
    clientY: 200,
  });
  fireEvent.pointerDown(node, {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 350,
    clientY: 200,
  });
  fireEvent.pointerMove(node, {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 450,
    clientY: 200,
  });
  expect(Number(node.getAttribute('data-camera-zoom'))).toBeCloseTo(3.2);
  fireEvent.pointerCancel(node, { pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerCancel(node, { pointerId: 2, pointerType: 'touch' });
  expect(node.hasAttribute('data-dragging')).toBe(false);
});

it('keeps ordinary wheel scrolling and a one-finger swipe on touch devices', () => {
  render(<CommunityCube />);
  const scene =
    document.querySelector('[data-closeup]') ??
    document.querySelector('[data-community-cube]')!.parentElement!;
  const overviewWheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -120,
  });
  fireEvent(scene, overviewWheel);
  expect(overviewWheel.defaultPrevented).toBe(false);
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
  const node = viewer();
  const wheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  fireEvent(node, wheel);
  expect(wheel.defaultPrevented).toBe(false);
  expect(Number(node.getAttribute('data-camera-zoom'))).toBeCloseTo(1.6);
  const down = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    clientX: 300,
    clientY: 200,
  });
  fireEvent(node, down);
  fireEvent.pointerMove(node, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 300,
    clientY: 300,
  });
  expect(down.defaultPrevented).toBe(false);
  expect(Number(node.getAttribute('data-camera-y'))).toBe(0.5);
  fireEvent.pointerCancel(node, { pointerId: 1, pointerType: 'touch' });
});

it('zooms out on the old face before rotating the whole cube', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  render(<CommunityCube />);
  fireEvent.change(screen.getByRole('slider', { name: 'Масштаб грани' }), {
    target: { value: '4' },
  });
  act(() => vi.advanceTimersByTime(900));
  fireEvent.click(screen.getByRole('button', { name: 'Правая' }));
  expect(viewer().getAttribute('data-face')).toBe('0');
  act(() => vi.advanceTimersByTime(220));
  const intermediate = Number(viewer().getAttribute('data-camera-zoom'));
  expect(intermediate).toBeGreaterThan(1);
  expect(intermediate).toBeLessThan(16);
  expect(viewer().getAttribute('data-face')).toBe('0');
  act(() => vi.advanceTimersByTime(300));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Правая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    document
      .querySelector<HTMLElement>('[data-community-cube]')!
      .style.getPropertyValue('--ry'),
  ).toBe('-114deg');
  act(() => vi.advanceTimersByTime(800));
  expect(
    (
      screen.getByRole('button', {
        name: 'Увеличить масштаб',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it('honors the last face selection and cancels animation work on unmount', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  const view = render(<CommunityCube />);
  fireEvent.change(screen.getByRole('slider', { name: 'Масштаб грани' }), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Правая' }));
  act(() => vi.advanceTimersByTime(200));
  fireEvent.click(screen.getByRole('button', { name: 'Левая' }));
  act(() => vi.advanceTimersByTime(550));
  expect(
    screen.getByRole('button', { name: 'Левая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('restores ordinary wheel zoom in the desktop workspace, including from overview', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  render(<CommunityCube />);
  const scene = document.querySelector('[data-community-cube]')!.parentElement!
    .parentElement!;
  const wheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -120,
  });
  fireEvent(scene, wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeGreaterThan(1);
  const previous = Number(viewer().getAttribute('data-camera-zoom'));
  const detailWheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -120,
    clientX: 300,
    clientY: 200,
  });
  fireEvent(viewer(), detailWheel);
  expect(detailWheel.defaultPrevented).toBe(true);
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeGreaterThan(
    previous,
  );
});

it('eases zoom, accumulates rapid input and cancels pending zoom when changing faces', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  const view = render(<CommunityCube />);
  const plus = screen.getByRole('button', { name: 'Увеличить масштаб' });
  fireEvent.click(plus);
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(64));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  const cube = document.querySelector<HTMLElement>('[data-community-cube]')!;
  expect(cube.style.getPropertyValue('--rx')).toBe('0deg');
  expect(cube.style.getPropertyValue('--ry')).toBe('0deg');
  act(() => vi.advanceTimersByTime(560));
  const intermediate = Number(viewer().getAttribute('data-camera-zoom'));
  expect(intermediate).toBeGreaterThan(1);
  expect(intermediate).toBeLessThan(1.6);
  fireEvent.click(plus);
  fireEvent.click(plus);
  act(() => vi.advanceTimersByTime(900));
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeCloseTo(
    1.6 ** 3,
    5,
  );
  fireEvent.change(screen.getByRole('slider', { name: 'Масштаб грани' }), {
    target: { value: '6' },
  });
  act(() => vi.advanceTimersByTime(64));
  fireEvent.click(screen.getByRole('button', { name: 'Левая' }));
  act(() => vi.advanceTimersByTime(1400));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Левая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('restores each face to its previous 3D angle after withdrawing to a matching flat frame', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  render(<CommunityCube />);
  for (const name of [
    'Лицевая',
    'Правая',
    'Обратная',
    'Левая',
    'Верхняя',
    'Нижняя',
  ]) {
    fireEvent.click(screen.getByRole('button', { name }));
    act(() => vi.advanceTimersByTime(800));
    const cube = document.querySelector<HTMLElement>('[data-community-cube]')!;
    expect(cube.querySelectorAll('[data-active-face]')).toHaveLength(1);
    expect(
      cube
        .querySelector('[data-active-face] canvas')!
        .getAttribute('aria-label'),
    ).toMatch(new RegExp(`^${name} грань`));
    const previous = [
      cube.style.getPropertyValue('--rx'),
      cube.style.getPropertyValue('--ry'),
    ];
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
    expect(
      cube.closest('[data-zoom-stage]')!.getAttribute('data-zoom-stage'),
    ).toBe('aligning');
    act(() => vi.advanceTimersByTime(1500));
    expect(Number(viewer().getAttribute('data-camera-zoom'))).toBe(1.6);
    fireEvent.click(screen.getByRole('button', { name: 'Куб целиком' }));
    act(() => vi.advanceTimersByTime(180));
    expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeGreaterThan(
      1,
    );
    act(() => vi.advanceTimersByTime(1400));
    const overview = screen.getByRole('group', { name: /Общий вид куба/ });
    const restored = overview.querySelector<HTMLElement>(
      '[data-community-cube]',
    )!;
    expect([
      restored.style.getPropertyValue('--rx'),
      restored.style.getPropertyValue('--ry'),
    ]).toEqual(previous);
    expect(overview.hasAttribute('data-zoom-stage')).toBe(false);
    expect(
      screen.getByRole('button', { name }).getAttribute('aria-pressed'),
    ).toBe('true');
  }
});

it('reverses direction during alignment and depth reveal without stale callbacks changing the camera', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  const view = render(<CommunityCube />);
  const plus = screen.getByRole('button', { name: 'Увеличить масштаб' });
  const reset = screen.getByRole('button', { name: 'Куб целиком' });
  fireEvent.click(plus);
  act(() => vi.advanceTimersByTime(160));
  fireEvent.click(reset);
  fireEvent.click(plus);
  act(() => vi.advanceTimersByTime(1500));
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBe(1.6);
  fireEvent.click(reset);
  act(() => vi.advanceTimersByTime(800));
  const overview = screen.getByRole('group', { name: /Общий вид куба/ });
  expect(overview.getAttribute('data-zoom-stage')).toBe('revealing');
  fireEvent.click(plus);
  act(() => vi.advanceTimersByTime(2200));
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBe(1.6);
  fireEvent.click(reset);
  act(() => vi.advanceTimersByTime(1800));
  const restored = document.querySelector<HTMLElement>(
    '[data-community-cube]',
  )!;
  expect(restored.style.getPropertyValue('--rx')).toBe('-18deg');
  expect(restored.style.getPropertyValue('--ry')).toBe('-28deg');
  fireEvent.click(plus);
  act(() => vi.advanceTimersByTime(100));
  fireEvent.change(screen.getByRole('combobox', { name: 'Демо-куб' }), {
    target: { value: '3' },
  });
  act(() => vi.advanceTimersByTime(1600));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(
    document
      .querySelector('[data-community-cube]')!
      .getAttribute('data-generation'),
  ).toBe('3');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('turns toward the personal mark before flying in, and interrupts a return flight cleanly', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
  const view = render(<CommunityCube />);
  addMark();
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(
    screen
      .getByRole('button', { name: 'Верхняя' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(900));
  const intermediate = Number(viewer().getAttribute('data-camera-zoom'));
  expect(intermediate).toBeGreaterThan(1);
  expect(intermediate).toBeLessThan(4.2);
  expect(viewer().parentElement!.hasAttribute('inert')).toBe(true);
  act(() => vi.advanceTimersByTime(600));
  expect(viewer().parentElement!.hasAttribute('inert')).toBe(false);
  expect(viewer().getAttribute('data-face')).toBe('4');
  expect(Number(viewer().getAttribute('data-camera-x'))).toBeCloseTo(0.105);
  expect(Number(viewer().getAttribute('data-camera-y'))).toBeCloseTo(0.1445);
  fireEvent.click(screen.getByRole('button', { name: 'Лицевая' }));
  act(() => vi.advanceTimersByTime(1400));
  fireEvent.click(
    screen.getAllByRole('button', { name: 'К моему автографу' })[0]!,
  );
  act(() => vi.advanceTimersByTime(1150));
  expect(Number(viewer().getAttribute('data-camera-zoom'))).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole('button', { name: 'Правая' }));
  act(() => vi.advanceTimersByTime(2200));
  expect(
    screen.queryByRole('group', { name: /Приближенная грань/ }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Правая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
