import { expect, it } from 'vitest';
import { loadEmailAuthConfig } from './email-auth';

it('requires explicit enablement, a sender and a UniSender Go API key', () => {
  const env = {
    APP_ENV: 'staging',
    WEB_ORIGIN: 'https://staging.destka.example',
    EMAIL_AUTH_ENABLED: 'true',
    UNISENDER_GO_API_KEY: 'synthetic-api-key',
    AUTH_EMAIL_FROM: 'accounts@example.test',
  };
  expect(loadEmailAuthConfig({})).toBeNull();
  expect(loadEmailAuthConfig(env)?.from).toBe(env.AUTH_EMAIL_FROM);
  expect(() =>
    loadEmailAuthConfig({ ...env, UNISENDER_GO_API_KEY: undefined }),
  ).toThrow('values redacted');
  expect(() =>
    loadEmailAuthConfig({ ...env, WEB_ORIGIN: 'http://127.0.0.1:3000' }),
  ).toThrow('values redacted');
});
