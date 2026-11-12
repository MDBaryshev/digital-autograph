// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalDocumentBody } from './legal-document-body';
import {
  loadLegalDocuments,
  loadSecurityDocuments,
} from '@digital-autograph/config';

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

it('preserves every character of the eight current Destka source texts in reading blocks', () => {
  // Test-only source access; the Web runtime still reads published API bytes only.
  const documents = [
    ...loadLegalDocuments().filter((document) => document.current),
    ...loadSecurityDocuments().filter((document) => document.current),
  ];
  expect(documents).toHaveLength(8);
  for (const document of documents) {
    const { container, unmount } = render(
      <LegalDocumentBody text={document.content} />,
    );
    const rendered = Array.from(container.querySelectorAll('h2, p'))
      .map((block) => block.textContent)
      .join('\n\n');
    expect(rendered).toBe(document.content);
    unmount();
  }
});
