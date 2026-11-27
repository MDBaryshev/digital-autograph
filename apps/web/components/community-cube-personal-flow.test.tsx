// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommunityCube } from './community-cube';

// Exercise the real CanvasEditor callbacks, not the navigation suite's drawing stub.
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
    height: 300,
    right: 600,
    bottom: 300,
    toJSON: () => ({}),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
    })),
  );
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      pressure: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
        this.pressure = init.pressure ?? 0.5;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('draws a real personal mark, pans it, rotates the whole cube, changes faces and finds the same mark again', () => {
  render(<CommunityCube />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Оставить свой автограф' }),
  );
  const drawing = screen.getByLabelText('Autograph drawing area');
  fireEvent.pointerDown(drawing, {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(drawing, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 180,
  });
  fireEvent.pointerUp(drawing, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 400,
    clientY: 150,
  });
  const save = screen.getByRole('button', { name: /Выбрать место на кубе/ });
  expect((save as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(save);
  fireEvent.click(screen.getByRole('button', { name: /^Нижняя.*свободно/ }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Ячейка № 144 — свободна' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Разместить здесь/ }));
  expect(screen.queryByRole('dialog')).toBeNull();
  const detail = screen.getByRole('group', { name: /Приближенная грань/ });
  expect(detail.getAttribute('data-face')).toBe('5');
  fireEvent.pointerDown(detail, {
    pointerId: 2,
    pointerType: 'mouse',
    button: 0,
    clientX: 300,
    clientY: 150,
  });
  fireEvent.pointerMove(detail, {
    pointerId: 2,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 160,
  });
  fireEvent.pointerUp(detail, {
    pointerId: 2,
    pointerType: 'mouse',
    clientX: 350,
    clientY: 160,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Куб целиком' }));
  fireEvent.click(screen.getByRole('button', { name: 'Лицевая' }));
  const overview = screen.getByRole('group', { name: /Общий вид куба/ });
  fireEvent.pointerDown(overview, {
    pointerId: 3,
    pointerType: 'mouse',
    button: 0,
    clientX: 200,
    clientY: 150,
  });
  fireEvent.pointerMove(overview, {
    pointerId: 3,
    pointerType: 'mouse',
    clientX: 450,
    clientY: 180,
  });
  fireEvent.pointerUp(overview, {
    pointerId: 3,
    pointerType: 'mouse',
    clientX: 450,
    clientY: 180,
  });
  expect(
    screen.getByRole('button', { name: 'Левая' }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(
    screen.getAllByRole('button', { name: 'К моему автографу' })[0]!,
  );
  const returned = screen.getByRole('group', { name: /Приближенная грань/ });
  expect(returned.getAttribute('data-face')).toBe('5');
  expect(Number(returned.getAttribute('data-camera-x'))).toBeCloseTo(0.895);
  expect(Number(returned.getAttribute('data-camera-y'))).toBeCloseTo(0.8555);
});
