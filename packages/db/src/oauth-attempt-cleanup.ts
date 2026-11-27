import type { Pool } from 'pg';

export const oauthAttemptCleanupBatchSize = 1000;

export function createPgOAuthAttemptCleanup(pool: Pool) {
  return async (limit = oauthAttemptCleanupBatchSize): Promise<number> => {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > oauthAttemptCleanupBatchSize
    )
      throw new RangeError('OAuth cleanup batch must contain 1–1000 rows');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bound execution even when DDL or other table-level locks block cleanup.
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      const result = await client.query(
        `WITH expired AS (
           SELECT id FROM oauth_login_attempts
           WHERE expires_at <= statement_timestamp()
           ORDER BY expires_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         DELETE FROM oauth_login_attempts AS attempt
         USING expired
         WHERE attempt.id = expired.id
           AND attempt.expires_at <= statement_timestamp()`,
        [limit],
      );
      const emailCleanup = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(176, 3) AS acquired',
      );
      if (emailCleanup.rows[0]?.acquired) {
        await client.query(
          `DELETE FROM email_auth_challenges WHERE id IN (
             SELECT id FROM email_auth_challenges WHERE expires_at <= statement_timestamp()
             ORDER BY expires_at LIMIT $1
           ) AND expires_at <= statement_timestamp()`,
          [limit],
        );
        await client.query(
          `DELETE FROM auth_rate_limits WHERE key_hash IN (
             SELECT key_hash FROM auth_rate_limits WHERE expires_at <= statement_timestamp()
             ORDER BY expires_at LIMIT $1
           ) AND expires_at <= statement_timestamp()`,
          [limit],
        );
      }
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}
