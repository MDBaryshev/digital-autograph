// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { SupcubeDesignLab } from './supcube-design-lab';

vi.mock('./try-wall', () => ({
  TryWall: () => <div>Демонстрационная стена</div>,
}));
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
              { x: 200, y: 180, pressure: 0.5 },
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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps homepage A and the chosen autograph when closing and reopening the embedded cube', () => {
  const location = window.location.href;
  render(<SupcubeDesignLab standalone />);
  expect(
    screen.queryByRole('group', { name: 'Направление дизайна' }),
  ).toBeNull();
  const hero = screen.getByRole('heading', { level: 1 });
  expect(hero.textContent).toContain('Твой почерк.');
  fireEvent.click(screen.getByRole('link', { name: /Создать автограф/ }));
  expect(window.location.href).toBe(location);
  fireEvent.click(
    screen.getByRole('button', { name: 'Нарисовать тестовый автограф' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Выбрать место на кубе/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Нижняя.*свободно/ }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Ячейка № 144 — свободна' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Разместить здесь/ }));
  const cube = screen.getByRole('dialog', {
    name: 'Твоё место в общей истории',
  });
  expect(
    within(cube).queryByRole('button', { name: 'Оставить свой автограф' }),
  ).toBeNull();
  expect(
    within(cube)
      .getByRole('group', { name: /Приближенная грань/ })
      .getAttribute('data-face'),
  ).toBe('5');
  fireEvent.click(
    within(cube).getByRole('button', { name: 'Вернуться на главную' }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 })).toBe(hero);
  expect(document.body.style.overflow).toBe('');
  expect(window.location.href).toBe(location);
  fireEvent.click(screen.getByRole('link', { name: 'К моему автографу' }));
  const reopened = screen.getByRole('dialog', {
    name: 'Твоё место в общей истории',
  });
  expect(within(reopened).getByText('97 / 144 автографов')).toBeTruthy();
  const viewer = within(reopened).getByRole('group', {
    name: /Приближенная грань/,
  });
  expect(viewer.getAttribute('data-face')).toBe('5');
  expect(Number(viewer.getAttribute('data-camera-x'))).toBeCloseTo(0.895);
  expect(Number(viewer.getAttribute('data-camera-y'))).toBeCloseTo(0.8555);
  fireEvent(reopened, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens deep links over the same homepage and preserves it when canceling creation', () => {
  render(<SupcubeDesignLab standalone initialCube="create" />);
  const drawing = screen.getByRole('dialog', {
    name: 'Твой почерк. Твоё место.',
  });
  fireEvent(drawing, new Event('cancel', { cancelable: true }));
  const cube = screen.getByRole('dialog', { name: 'Общий куб' });
  fireEvent.click(
    within(cube).getByRole('button', { name: 'Вернуться на главную' }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
    'Твой почерк.',
  );
  fireEvent.click(screen.getByRole('link', { name: /Создать автограф/ }));
  expect(
    screen.getByRole('dialog', { name: 'Твой почерк. Твоё место.' }),
  ).toBeTruthy();
});
