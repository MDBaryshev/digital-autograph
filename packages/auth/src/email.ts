import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';

export type EmailPurpose = 'register' | 'reset';
type EmailOperation = EmailPurpose | 'login' | 'confirm';
export interface EmailAuthRepository {
  takeRateLimit(
    keyHash: string,
    limit: number,
    address?: { keyHash: string; limit: number },
  ): Promise<boolean>;
  issueChallenge(
    email: string,
    purpose: EmailPurpose,
    tokenHash: string,
  ): Promise<boolean>;
  findCredential(
    email: string,
  ): Promise<{ userId: string; passwordHash: string } | null>;
  hasLiveChallenge(tokenHash: string): Promise<boolean>;
  completeChallenge(tokenHash: string, passwordHash: string): Promise<boolean>;
  createPasswordSession(
    userId: string,
    passwordHash: string,
    secretHash: string,
    ttlSeconds: number,
  ): Promise<boolean>;
}
export interface AuthEmailSender {
  send(input: {
    email: string;
    purpose: EmailPurpose;
    token: string;
    returnTo?: string;
  }): Promise<void>;
}
export const authSecretHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export class EmailAuthService {
  constructor(
    private readonly repository: EmailAuthRepository,
    private readonly sender: AuthEmailSender,
    private readonly ttlSeconds: number,
  ) {
    if (
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 300 ||
      ttlSeconds > 2592000
    )
      throw new Error('Invalid session TTL');
  }
  async allow(operation: EmailOperation, email?: string): Promise<boolean> {
    return this.repository.takeRateLimit(
      authSecretHash(`email-auth:${operation}`),
      1000,
      email
        ? { keyHash: authSecretHash(`${operation}:${email}`), limit: 8 }
        : undefined,
    );
  }
  async request(
    email: string,
    purpose: EmailPurpose,
    returnTo?: string,
  ): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    if (
      await this.repository.issueChallenge(
        email,
        purpose,
        authSecretHash(token),
      )
    )
      await this.sender.send({
        email,
        purpose,
        token,
        ...(returnTo ? { returnTo } : {}),
      });
  }
  async complete(token: string, password: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const tokenHash = authSecretHash(token);
    if (!(await this.repository.hasLiveChallenge(tokenHash))) return false;
    return this.repository.completeChallenge(
      tokenHash,
      await hashPassword(password),
    );
  }
  async login(email: string, password: string): Promise<string | null> {
    const credential = await this.repository.findCredential(email);
    const valid = await verifyPassword(
      password,
      credential?.passwordHash ?? null,
    );
    if (!valid || !credential) return null;
    const token = `da_s1_${randomBytes(32).toString('base64url')}`;
    // Recheck the hash under the same user lock as reset/logout-all/session creation.
    return (await this.repository.createPasswordSession(
      credential.userId,
      credential.passwordHash,
      authSecretHash(token),
      this.ttlSeconds,
    ))
      ? token
      : null;
  }
}
