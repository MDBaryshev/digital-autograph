import { z } from 'zod';

export function loadTelegramLinkConfig(environment = process.env) {
  try {
    const enabled = z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.TELEGRAM_LINK_ENABLED);
    if (enabled === 'false') return null;
    const config = z
      .object({
        APP_ENV: z.enum([
          'local',
          'test',
          'development',
          'staging',
          'production',
        ]),
        API_PUBLIC_ORIGIN: z.url(),
        TELEGRAM_CLIENT_ID: z.string().min(1).max(256),
        TELEGRAM_CLIENT_SECRET: z.string().min(1).max(4096),
        TELEGRAM_REDIRECT_URI: z.url(),
      })
      .parse(environment);
    const callback = new URL(config.TELEGRAM_REDIRECT_URI);
    const origin = new URL(config.API_PUBLIC_ORIGIN);
    const local = ['local', 'test', 'development'].includes(config.APP_ENV);
    if (
      origin.origin !== config.API_PUBLIC_ORIGIN ||
      callback.origin !== origin.origin ||
      callback.pathname !== '/me/connections/telegram/callback' ||
      callback.search ||
      callback.hash ||
      callback.username ||
      callback.password ||
      (callback.protocol !== 'https:' &&
        !(
          local &&
          callback.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(callback.hostname)
        ))
    )
      throw Error();
    return {
      clientId: config.TELEGRAM_CLIENT_ID,
      clientSecret: config.TELEGRAM_CLIENT_SECRET,
      redirectUri: config.TELEGRAM_REDIRECT_URI,
      includeProfile: false,
    };
  } catch {
    throw new Error('Invalid Telegram linking configuration (values redacted)');
  }
}
