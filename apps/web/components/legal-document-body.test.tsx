// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalDocumentBody } from './legal-document-body';

afterEach(cleanup);

it('preserves source wording in paragraphs and sections', () => {
  const text = [
    'ПУБЛИЧНАЯ ОФЕРТА',
    'Редакция 1.0',
    '1. Термины и определения',
    'Первый абзац.\nВторая строка.',
    '1.1. Это положение, а не заголовок.',
  ].join('\n\n');

  const { container } = render(<LegalDocumentBody text={text} />);
  const heading = screen.getByRole('heading', {
    name: '1. Термины и определения',
  });
  expect(heading).toBeTruthy();
  expect(screen.getByText('Первый абзац. Вторая строка.')).toBeTruthy();

  const rendered = Array.from(container.querySelectorAll('h2, p')).map(
    (element) => element.textContent,
  );
  expect(rendered).toEqual(text.split('\n\n'));
});

it('treats HTML and Markdown syntax as literal text', () => {
  const source = [
    '<script>alert("test")</script>',
    '[Публичная оферта](https://destka.ru)',
  ].join('\n\n');
  const { container } = render(<LegalDocumentBody text={source} />);

  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
  expect(screen.getByText('<script>alert("test")</script>')).toBeTruthy();
  const markdown = screen.getByText('[Публичная оферта](https://destka.ru)');
  expect(markdown).toBeTruthy();
});
