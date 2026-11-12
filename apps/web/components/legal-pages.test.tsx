// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DocumentLinks } from './legal-pages';

vi.mock('../lib/i18n-server', () => ({
  getTranslator: async () => (text: string) => text,
}));
afterEach(cleanup);

it.each([true, false])(
  'names document links by title and describes their visible edition status (current=%s)',
  async (current) => {
    render(
      await DocumentLinks({
        documents: [
          {
            type: 'terms_of_use',
            version: 'test-v1',
            current,
            hash: 'a'.repeat(64),
            path: '/legal/documents/terms_of_use/test-v1',
          },
        ],
      }),
    );
    const status = current ? 'Текущая редакция' : 'Архив редакций';
    const link = screen.getByRole('link', {
      name: 'Пользовательское соглашение',
      description: status,
    });
    expect(screen.getByText(status).getAttribute('aria-hidden')).toBeNull();
    expect(link.getAttribute('href')).toBe(
      current ? '/legal/terms' : '/legal/terms/archive',
    );
    expect(screen.queryByRole('link', { name: 'Публичная оферта' })).toBeNull();
  },
);
