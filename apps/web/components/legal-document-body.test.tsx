// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalDocumentBody } from './legal-document-body';

afterEach(cleanup);

it('presents numbered sections and paragraphs without changing the wording', () => {
  const text =
    'ПУБЛИЧНАЯ ОФЕРТА\n\nРедакция 1.0\n\n1. Термины и определения\n\nПервый абзац.\nВторая строка.\n\n1.1. Это положение, а не заголовок.';

  const { container } = render(<LegalDocumentBody text={text} />);
  expect(screen.getByRole('heading', { name: '1. Термины и определения' })).toBeTruthy();
  expect(screen.getByText('Первый абзац.\nВторая строка.')).toBeTruthy();
  expect(screen.getByText('1.1. Это положение, а не заголовок.')).toBeTruthy();
  expect(Array.from(container.querySelectorAll('h2, p')).map((element) => element.textContent)).toEqual(
    text.split('\n\n'),
  );
});

it('never treats canonical text as HTML, Markdown, or executable links', () => {
  const source = '<script>alert("test")</script>\n\n[Публичная оферта](https://destka.ru)';
  const { container } = render(<LegalDocumentBody text={source} />);

  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
  expect(screen.getByText('<script>alert("test")</script>')).toBeTruthy();
  expect(screen.getByText('[Публичная оферта](https://destka.ru)')).toBeTruthy();
});
