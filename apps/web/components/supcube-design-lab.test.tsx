// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SupcubeDesignLab } from './supcube-design-lab';

vi.mock('./try-wall', () => ({
  TryWall: () => <div>Демонстрационная стена</div>,
}));
afterEach(cleanup);

it('compares both directions while preserving the real create and community destinations', () => {
  render(<SupcubeDesignLab />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
    'Твой почерк.',
  );
  expect(
    screen.getByRole('link', { name: /Создать автограф/ }).getAttribute('href'),
  ).toBe('/autograph/create');
  fireEvent.click(screen.getByRole('button', { name: /Куб в центре/ }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
    'Каждый почерк',
  );
  expect(
    screen.getByRole('link', { name: /Создать автограф/ }).getAttribute('href'),
  ).toBe('/autograph/create');
  expect(
    screen.getByRole('link', { name: /Исследовать куб/ }).getAttribute('href'),
  ).toBe('/community-cube');
  expect(
    screen.getByText('Общий куб пока работает как прототип.'),
  ).toBeTruthy();
  expect(
    screen.getByText('Вместимость кубов, а не число участников.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Куб как часть сайта/ }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
    'Твой почерк.',
  );
});

it('keeps the compact preview active when switching design directions', () => {
  const { container } = render(<SupcubeDesignLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Мобильный вид' }));
  expect(container.querySelector('[data-mobile]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Куб в центре/ }));
  expect(container.querySelector('[data-mobile]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Полная ширина' }));
  expect(container.querySelector('[data-mobile]')).toBeNull();
});
