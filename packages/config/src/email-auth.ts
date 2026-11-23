import { z } from 'zod';

export function loadEmailAuthConfig(environment = process.env) {
  try {
    const enabled = z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.EMAIL_AUTH_ENABLED);
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
        WEB_ORIGIN: z.url(),
        UNISENDER_GO_API_KEY: z
          .string()
          .min(1)
          .max(4096)
          .regex(/^[!-~]+$/),
        AUTH_EMAIL_FROM: z.email().max(254),
      })
      .parse(environment);
    const origin = new URL(config.WEB_ORIGIN);
    const local =
      ['local', 'test', 'development'].includes(config.APP_ENV) &&
      origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(origin.hostname);
    if (
      origin.origin !== config.WEB_ORIGIN ||
      (origin.protocol !== 'https:' && !local)
    )
      throw new Error();
    return {
      apiKey: config.UNISENDER_GO_API_KEY,
      from: config.AUTH_EMAIL_FROM,
      webOrigin: origin.origin,
    };
  } catch {
    throw new Error(
      'Invalid email authentication configuration (values redacted)',
    );
  }
}
