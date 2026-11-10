import type {
  EmailAuthRepository,
  EmailPurpose,
} from '@digital-autograph/auth';
import type { Pool, PoolClient } from 'pg';

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export function createPgEmailAuthRepository(pool: Pool): EmailAuthRepository {
  return {
    async takeRateLimit(keyHash, limit) {
      const r = await pool.query(
        `INSERT INTO auth_rate_limits (key_hash, used, expires_at)
        VALUES ($1, 1, statement_timestamp() + interval '15 minutes')
        ON CONFLICT (key_hash) DO UPDATE SET
          used = CASE WHEN auth_rate_limits.expires_at <= statement_timestamp() THEN 1 ELSE auth_rate_limits.used + 1 END,
          expires_at = CASE WHEN auth_rate_limits.expires_at <= statement_timestamp() THEN statement_timestamp() + interval '15 minutes' ELSE auth_rate_limits.expires_at END
        WHERE auth_rate_limits.expires_at <= statement_timestamp() OR auth_rate_limits.used < $2
        RETURNING key_hash`,
        [keyHash, limit],
      );
      return r.rowCount === 1;
    },
    async findCredential(email) {
      const r = await pool.query<{ user_id: string; password_hash: string }>(
        `SELECT c.user_id, c.password_hash
        FROM email_credentials c JOIN users u ON u.id = c.user_id WHERE c.email = $1 AND u.status = 'active'`,
        [email],
      );
      const row = r.rows[0];
      return row
        ? { userId: row.user_id, passwordHash: row.password_hash }
        : null;
    },
    async issueChallenge(email, purpose, tokenHash) {
      return transaction(pool, async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `email:${email}`,
        ]);
        const existing = await c.query<{ user_id: string; status: string }>(
          `SELECT e.user_id, u.status FROM email_credentials e
          JOIN users u ON u.id = e.user_id WHERE e.email = $1`,
          [email],
        );
        const user = existing.rows[0];
        if (purpose === 'register' ? !!user : !user || user.status !== 'active')
          return false;
        // Resends cannot silently replace the link already in someone's inbox.
        const recent = await c.query(
          `SELECT 1 FROM email_auth_challenges WHERE email = $1 AND purpose = $2
          AND created_at > statement_timestamp() - interval '1 minute'`,
          [email, purpose],
        );
        if (recent.rowCount) return false;
        await c.query(
          `INSERT INTO email_auth_challenges (email, purpose, user_id, token_hash, expires_at)
          VALUES ($1, $2, $3, $4, statement_timestamp() + interval '30 minutes')`,
          [email, purpose, user?.user_id ?? null, tokenHash],
        );
        return true;
      });
    },
    async hasLiveChallenge(tokenHash) {
      const result = await pool.query(
        `SELECT 1 FROM email_auth_challenges WHERE token_hash=$1
          AND consumed_at IS NULL AND expires_at > statement_timestamp()`,
        [tokenHash],
      );
      return result.rowCount === 1;
    },
    async completeChallenge(tokenHash, passwordHash) {
      return transaction(pool, async (c) => {
        const r = await c.query<{
          email: string;
          purpose: EmailPurpose;
          user_id: string | null;
        }>(
          `SELECT email, purpose, user_id FROM email_auth_challenges WHERE token_hash = $1
           AND consumed_at IS NULL AND expires_at > statement_timestamp()`,
          [tokenHash],
        );
        const challenge = r.rows[0];
        if (!challenge) return false;
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `email:${challenge.email}`,
        ]);
        if (challenge.user_id) {
          const u = await c.query(
            "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
            [challenge.user_id],
          );
          if (!u.rowCount) return false;
        }
        const consumed = await c.query(
          `UPDATE email_auth_challenges SET consumed_at = statement_timestamp()
          WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > statement_timestamp() RETURNING id`,
          [tokenHash],
        );
        if (!consumed.rowCount) return false;
        if (challenge.purpose === 'register') {
          const exists = await c.query(
            'SELECT 1 FROM email_credentials WHERE email = $1',
            [challenge.email],
          );
          if (exists.rowCount) return false;
          const u = await c.query<{ id: string }>(
            "INSERT INTO users (status) VALUES ('active') RETURNING id",
          );
          await c.query(
            'INSERT INTO email_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)',
            [u.rows[0]!.id, challenge.email, passwordHash],
          );
        } else {
          const updated = await c.query(
            `UPDATE email_credentials SET password_hash = $1, updated_at = statement_timestamp()
            WHERE user_id = $2 AND email = $3`,
            [passwordHash, challenge.user_id, challenge.email],
          );
          if (!updated.rowCount) return false;
          await c.query(
            'UPDATE sessions SET revoked_at = statement_timestamp() WHERE user_id = $1 AND revoked_at IS NULL',
            [challenge.user_id],
          );
        }
        // Any other link for this address is invalid after password setup/reset.
        await c.query(
          `UPDATE email_auth_challenges SET consumed_at = statement_timestamp() WHERE email = $1 AND consumed_at IS NULL`,
          [challenge.email],
        );
        return true;
      });
    },
    async createPasswordSession(userId, passwordHash, secretHash, ttlSeconds) {
      return transaction(pool, async (c) => {
        const u = await c.query(
          "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
          [userId],
        );
        if (!u.rowCount) return false;
        const r = await c.query(
          'SELECT 1 FROM email_credentials WHERE user_id = $1 AND password_hash = $2',
          [userId, passwordHash],
        );
        if (!r.rowCount) return false;
        await c.query(
          `INSERT INTO sessions (user_id, secret_hash, expires_at)
          VALUES ($1, $2, statement_timestamp() + ($3::integer * interval '1 second'))`,
          [userId, secretHash, ttlSeconds],
        );
        return true;
      });
    },
  };
}
