import { expect, it } from 'vitest';
import {
  loadOpenRouterConfig,
  loadTelegramModerationConfig,
} from './openrouter';
it('needs no credentials when disabled, and fails closed for incomplete activation', () => {
  expect(loadOpenRouterConfig({})).toBeNull();
  expect(() =>
    loadOpenRouterConfig({ AI_AUTOGRAPH_GENERATION_ENABLED: 'true' }),
  ).toThrow('values redacted');
  expect(() =>
    loadOpenRouterConfig({ AI_AUTOGRAPH_MODERATION_ENABLED: 'yes' }),
  ).toThrow();
  expect(() =>
    loadOpenRouterConfig({
      AI_AUTOGRAPH_MODERATION_ENABLED: 'true',
      OPENROUTER_API_KEY: 'synthetic-private-key',
      OPENROUTER_MODERATION_MODEL: 'synthetic/vision',
    }),
  ).toThrow('values redacted');
});

it('activates Telegram screening independently with a configured vision model', () => {
  expect(loadTelegramModerationConfig({})).toBeNull();
  expect(() =>
    loadTelegramModerationConfig({
      AI_TELEGRAM_PROFILE_MODERATION_ENABLED: 'true',
    }),
  ).toThrow('values redacted');
  const env = {
    AI_TELEGRAM_PROFILE_MODERATION_ENABLED: 'true',
    OPENROUTER_API_KEY: 'synthetic-private-key',
    OPENROUTER_TELEGRAM_MODERATION_MODEL: 'synthetic/vision',
  };
  expect(loadTelegramModerationConfig(env)?.model).toBe('synthetic/vision');
  expect(loadOpenRouterConfig(env)).toBeNull();
});
