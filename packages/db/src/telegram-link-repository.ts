import type { Pool, PoolClient } from 'pg';

export interface TelegramLinkRepository {
  linked(userId: string): Promise<boolean>;
  connect(
    userId: string,
    sessionId: string,
    subject: string,
    stateHash: string,
  ): Promise<boolean>;
  disconnect(userId: string, sessionId: string): Promise<boolean>;
}

export function createPgTelegramLinkRepository(
  pool: Pool,
): TelegramLinkRepository {
  async function withSession(
    userId: string,
    sessionId: string,
    work: (client: PoolClient) => Promise<boolean>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Same lock order as session issue/reset/logout-all. Recheck after provider I/O.
      const user = await client.query(
        "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
        [userId],
      );
      const session = await client.query(
        'SELECT id FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > statement_timestamp() FOR UPDATE',
        [sessionId, userId],
      );
      const result =
        !!user.rowCount && !!session.rowCount && (await work(client));
      await client.query(result ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        error.code === '23505'
      )
        return false;
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async linked(userId) {
      const result = await pool.query(
        "SELECT 1 FROM social_identities WHERE user_id=$1 AND provider='telegram'",
        [userId],
      );
      return !!result.rowCount;
    },
    connect(userId, sessionId, subject, stateHash) {
      return withSession(userId, sessionId, async (client) => {
        // The claimed attempt is also a cancellation record. Disconnect deletes it
        // under the same user lock, including while provider verification is in flight.
        const attempt = await client.query(
          "SELECT id FROM oauth_login_attempts WHERE provider='telegram_link' AND state_hash=$1 AND return_path=$2 AND consumed_at IS NOT NULL AND expires_at > statement_timestamp() FOR UPDATE",
          [stateHash, `/me/settings#telegram-link/${userId}:${sessionId}`],
        );
        if (!attempt.rowCount) return false;
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`telegram-link:${subject}`],
        );
        const existing = await client.query<{
          user_id: string;
          provider_user_id: string;
        }>(
          "SELECT user_id,provider_user_id FROM social_identities WHERE provider='telegram' AND (user_id=$1 OR provider_user_id=$2)",
          [userId, subject],
        );
        if (existing.rowCount)
          return existing.rows.every(
            (row) => row.user_id === userId && row.provider_user_id === subject,
          );
        await client.query(
          "INSERT INTO social_identities(user_id,provider,provider_user_id) VALUES($1,'telegram',$2)",
          [userId, subject],
        );
        return true;
      });
    },
    disconnect(userId, sessionId) {
      return withSession(userId, sessionId, async (client) => {
        await client.query(
          "DELETE FROM social_identities WHERE user_id=$1 AND provider='telegram'",
          [userId],
        );
        await client.query(
          "DELETE FROM oauth_login_attempts WHERE provider='telegram_link' AND return_path LIKE $1",
          [`/me/settings#telegram-link/${userId}:%`],
        );
        return true;
      });
    },
  };
}
