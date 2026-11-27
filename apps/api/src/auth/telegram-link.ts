import { createHash } from 'node:crypto';
import type {
  OAuthAttemptService,
  AuthenticatedSession,
} from '@digital-autograph/auth';
import type { TelegramOidcClient } from '@digital-autograph/integrations';
import type { TelegramLinkRepository } from '@digital-autograph/db';
import type { AppEnvironment } from '@digital-autograph/config';
import type { FastifyInstance } from 'fastify';
import { authenticatedSession, requireAuthenticatedUser } from './http';

export class TelegramLinkService {
  constructor(
    private readonly attempts: OAuthAttemptService,
    private readonly telegram: TelegramOidcClient,
    private readonly repository: TelegramLinkRepository,
  ) {}
  linked(userId: string) {
    return this.repository.linked(userId);
  }
  disconnect(session: AuthenticatedSession) {
    return this.repository.disconnect(session.user.id, session.sessionId);
  }
  async start(session: AuthenticatedSession) {
    const attempt = await this.attempts.createPkce(
      'telegram_link',
      `/me/settings#telegram-link/${session.user.id}:${session.sessionId}`,
    );
    return {
      authorizationUrl: await this.telegram.authorizationUrl({
        state: attempt.state,
        nonce: attempt.nonce,
        codeChallenge: createHash('sha256')
          .update(attempt.codeVerifier)
          .digest('base64url'),
      }),
      browserBinding: attempt.browserBinding,
      pkce: `${attempt.codeVerifier}.${attempt.nonce}`,
    };
  }
  async finish(
    session: AuthenticatedSession,
    input: {
      state?: string;
      browserBinding?: string;
      pkce?: string;
      code?: string;
      error?: string;
    },
  ) {
    const [codeVerifier, nonce] = input.pkce?.split('.') ?? [];
    const attempt = await this.attempts.claimPkce(
      'telegram_link',
      input.state,
      input.browserBinding,
      codeVerifier,
      nonce,
    );
    if (
      !attempt ||
      attempt.returnPath !==
        `/me/settings#telegram-link/${session.user.id}:${session.sessionId}` ||
      input.error ||
      !input.code ||
      input.code.length > 4096 ||
      !input.state ||
      !codeVerifier ||
      !nonce
    )
      return false;
    const verified = await this.telegram.verifyCode({
      code: input.code,
      state: input.state,
      nonce,
      codeVerifier,
    });
    if (!/^[0-9]{1,32}$/.test(verified.subject)) return false;
    // Deliberately no IdentityService, session creation, credential update or profile import.
    return this.repository.connect(
      session.user.id,
      session.sessionId,
      verified.subject,
      createHash('sha256').update(input.state).digest('hex'),
    );
  }
}

export function registerTelegramLinkRoutes(
  app: FastifyInstance,
  service: TelegramLinkService,
  config: { appEnvironment: AppEnvironment; webOrigin: string },
) {
  const cookieName = (kind: 'oauth' | 'pkce') =>
    `${config.appEnvironment === 'production' ? '__Host-' : ''}da_telegram_link_${kind}`;
  const cookieOptions = {
    httpOnly: true,
    secure: ['production', 'staging'].includes(config.appEnvironment),
    sameSite: 'lax' as const,
    path: '/',
  };
  app.get(
    '/me/connections/telegram',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        linked: await service.linked(authenticatedSession(request).user.id),
      };
    },
  );
  app.post(
    '/me/connections/telegram/start',
    { preHandler: requireAuthenticatedUser, bodyLimit: 1024 },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const started = await service.start(authenticatedSession(request));
      reply.setCookie(cookieName('oauth'), started.browserBinding, {
        ...cookieOptions,
        maxAge: 600,
      });
      reply.setCookie(cookieName('pkce'), started.pkce, {
        ...cookieOptions,
        maxAge: 600,
      });
      return { authorizationUrl: started.authorizationUrl };
    },
  );
  app.delete(
    '/me/connections/telegram',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const ok = await service.disconnect(authenticatedSession(request));
      for (const kind of ['oauth', 'pkce'] as const)
        reply.clearCookie(cookieName(kind), cookieOptions);
      return reply.code(ok ? 204 : 409).send();
    },
  );
  app.get(
    '/me/connections/telegram/callback',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer');
      const query = request.query as Record<string, unknown>;
      const param = (key: string) =>
        typeof query[key] === 'string' ? (query[key] as string) : undefined;
      const browserBinding = request.cookies[cookieName('oauth')];
      const pkce = request.cookies[cookieName('pkce')];
      for (const kind of ['oauth', 'pkce'] as const)
        reply.clearCookie(cookieName(kind), cookieOptions);
      let linked = false;
      try {
        linked = await service.finish(authenticatedSession(request), {
          state: param('state'),
          code: param('code'),
          error: param('error'),
          browserBinding,
          pkce,
        });
      } catch {
        /* Fixed public outcome; no provider data in errors. */
      }
      return reply.redirect(
        `${config.webOrigin}/me/settings?telegram=${linked ? 'linked' : 'failed'}`,
      );
    },
  );
}
