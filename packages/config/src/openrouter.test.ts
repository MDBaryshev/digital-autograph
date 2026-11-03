import { expect, it } from 'vitest';
import { loadOpenRouterConfig } from './openrouter';
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
