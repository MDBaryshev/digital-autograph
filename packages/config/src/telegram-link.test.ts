import { expect, it } from 'vitest';
import { loadTelegramLinkConfig } from './telegram-link';
const config = {
  APP_ENV: 'staging',
  API_PUBLIC_ORIGIN: 'https://api.example.test',
  TELEGRAM_LINK_ENABLED: 'true',
  TELEGRAM_CLIENT_ID: 'synthetic-client',
  TELEGRAM_CLIENT_SECRET: 'synthetic-secret',
  TELEGRAM_REDIRECT_URI:
    'https://api.example.test/me/connections/telegram/callback',
};
it('needs no Telegram keys until linking is enabled; only the exact same-API linking callback is allowed', () => {
  expect(loadTelegramLinkConfig({})).toBeNull();
  expect(loadTelegramLinkConfig(config)).toMatchObject({
    includeProfile: false,
  });
  for (const uri of [
    'https://api.example.test/auth/telegram/callback',
    'https://other.example.test/me/connections/telegram/callback',
    'http://api.example.test/me/connections/telegram/callback',
    'https://api.example.test/me/connections/telegram/callback?x=1',
  ]) {
    expect(() =>
      loadTelegramLinkConfig({ ...config, TELEGRAM_REDIRECT_URI: uri }),
    ).toThrow('values redacted');
  }
  expect(() =>
    loadTelegramLinkConfig({ ...config, TELEGRAM_CLIENT_SECRET: undefined }),
  ).toThrow('values redacted');
});
