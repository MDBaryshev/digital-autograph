import { afterEach, expect, it, vi } from 'vitest';
import { getLocale, getTranslator, localizeMetadata } from './i18n-server';
const settings = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (settings.value ? { value: settings.value } : undefined),
  }),
}));
afterEach(() => {
  settings.value = undefined;
});
it('uses the saved language for server-rendered text and metadata', async () => {
  expect(await getLocale()).toBe('ru');
  expect((await getTranslator())('Your account')).toBe('Ваш аккаунт');
  settings.value = 'en';
  expect(await getLocale()).toBe('en');
  expect((await getTranslator())('Условия вашего заказа')).toBe(
    'Your order terms',
  );
  expect(
    await localizeMetadata({
      title: 'Документы | supcube',
      description: 'Юридические документы',
    }),
  ).toMatchObject({
    title: 'Documents | supcube',
    description: 'Legal documents',
  });
  settings.value = 'ru';
  expect(
    await localizeMetadata({
      title: { default: 'Your account', template: '%s | supcube' },
    }),
  ).toMatchObject({
    title: { default: 'Ваш аккаунт', template: '%s | supcube' },
  });
});
