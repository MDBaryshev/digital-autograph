import { createHash } from 'node:crypto';
import {
  IdentityService,
  OAuthAttemptService,
  SessionService,
} from '@digital-autograph/auth';
import type {
  TelegramOidcClient,
  TelegramProfileClaims,
} from '@digital-autograph/integrations';

export const telegramLoginAttemptTtlSeconds = 600;

export type TelegramLoginResult =
  | { kind: 'success'; token: string; returnPath: string }
  | { kind: 'cancelled' | 'failed' | 'alreadyAuthenticated' };

export class TelegramLoginService {
  constructor(
    private readonly attempts: OAuthAttemptService,
    private readonly telegram: TelegramOidcClient,
    private readonly identities: IdentityService,
    private readonly sessions: Pick<SessionService, 'createSession'>,
    private readonly captureProfile?: (
      userId: string,
      profile: TelegramProfileClaims,
    ) => Promise<void>,
  ) {}

  async start(returnPath: string): Promise<{
    authorizationUrl: string;
    browserBinding: string;
    pkceCookieValue: string;
  }> {
    const attempt = await this.attempts.createPkce('telegram', returnPath);
    const codeChallenge = createHash('sha256')
      .update(attempt.codeVerifier, 'utf8')
      .digest('base64url');
    return {
      authorizationUrl: await this.telegram.authorizationUrl({
        state: attempt.state,
        nonce: attempt.nonce,
        codeChallenge,
      }),
      browserBinding: attempt.browserBinding,
      // Both values are browser-only, short-lived, and hashed in PostgreSQL.
      pkceCookieValue: `${attempt.codeVerifier}.${attempt.nonce}`,
    };
  }

  async finish(input: {
    state?: string;
    browserBinding?: string;
    pkceCookieValue?: string;
    code?: string;
    providerError?: string;
    alreadyAuthenticated: boolean;
  }): Promise<TelegramLoginResult> {
    try {
      const [codeVerifier, nonce] = input.pkceCookieValue?.split('.') ?? [];
      const attempt = await this.attempts.claimPkce(
        'telegram',
        input.state,
        input.browserBinding,
        codeVerifier,
        nonce,
      );
      if (!attempt) return { kind: 'failed' };
      if (input.alreadyAuthenticated) return { kind: 'alreadyAuthenticated' };
      if (input.providerError === 'access_denied') return { kind: 'cancelled' };
      if (input.providerError || !input.code || input.code.length > 4096) {
        return { kind: 'failed' };
      }
      if (!input.state || !codeVerifier || !nonce) return { kind: 'failed' };
      const { subject, ...profile } = await this.telegram.verifyCode({
        code: input.code,
        state: input.state,
        nonce,
        codeVerifier,
      });
      const userId = await this.identities.resolveOrCreateUser(
        'telegram',
        subject,
      );
      const session = await this.sessions.createSession(userId);
      // Optional profile data cannot fail authentication or overwrite a custom image.
      if (
        this.captureProfile &&
        (profile.name || profile.username || profile.picture)
      ) {
        await this.captureProfile(userId, profile).catch(() => {});
      }
      return {
        kind: 'success',
        token: session.token,
        returnPath: attempt.returnPath,
      };
    } catch {
      return { kind: 'failed' };
    }
  }
}
