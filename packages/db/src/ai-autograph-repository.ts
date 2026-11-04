import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

export class AiAdmissionError extends Error {}
export function createPgAiAutographRepository(pool: Pool) {
  return {
    async read(userId: string, operation: string) {
      return (
        (
          await pool.query(
            'SELECT state,result,created_at FROM ai_autograph_requests WHERE user_id=$1 AND operation=$2',
            [userId, operation],
          )
        ).rows[0] ?? null
      );
    },
    async claim(
      userId: string,
      operation: string,
      kind: 'generation' | 'moderation',
      fingerprint: string,
      model: string,
    ) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        // Serialize admission across every API instance, using DB UTC days.
        await db.query('SELECT pg_advisory_xact_lock(176, 1)');
        const active = await db.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR SHARE",
          [userId],
        );
        if (!active.rowCount) throw new AiAdmissionError('FORBIDDEN');
        const prior = await db.query(
          'SELECT fingerprint,state,result,created_at FROM ai_autograph_requests WHERE user_id=$1 AND operation=$2',
          [userId, operation],
        );
        if (prior.rowCount) {
          const row = prior.rows[0];
          if (row.fingerprint !== fingerprint)
            throw new AiAdmissionError('AI_REQUEST_CONFLICT');
          await db.query('COMMIT');
          if (
            row.state === 'completed' &&
            row.created_at.getTime() > Date.now() - 3600000
          )
            return { fresh: false as const, result: row.result };
          throw new AiAdmissionError('AI_REQUEST_UNAVAILABLE');
        }
        const counts = await db.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE user_id=$1)::int AS own FROM ai_autograph_requests WHERE kind=$2 AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          [userId, kind],
        );
        const c = counts.rows[0];
        if (
          c.total >= (kind === 'generation' ? 20 : 200) ||
          (kind === 'generation' && c.own >= 3)
        )
          throw new AiAdmissionError('AI_QUOTA_EXCEEDED');
        // A pending/failed request remains charged. No refund/retry after timeout.
        await db.query(
          'INSERT INTO ai_autograph_requests(user_id,operation,kind,fingerprint,model) VALUES($1,$2,$3,$4,$5)',
          [userId, operation, kind, fingerprint, model],
        );
        await db.query('COMMIT');
        return { fresh: true as const, result: null };
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      } finally {
        db.release();
      }
    },
    async finish(
      userId: string,
      operation: string,
      result: unknown,
      failed = false,
    ) {
      const r = await pool.query(
        "UPDATE ai_autograph_requests SET state=$3,result=$4,finished_at=now() WHERE user_id=$1 AND operation=$2 AND state='pending'",
        [
          userId,
          operation,
          failed ? 'failed' : 'completed',
          JSON.stringify(result),
        ],
      );
      if (r.rowCount !== 1) throw Error('AI_REQUEST_ALREADY_FINISHED');
    },
    async candidates() {
      return (
        await pool.query(
          `SELECT a.id, u.cleaned_asset_id FROM autographs a JOIN autograph_user_approvals u ON u.autograph_id=a.id WHERE a.status='awaiting_moderation' AND NOT EXISTS (SELECT 1 FROM ai_autograph_requests r WHERE r.operation='moderation:' || u.cleaned_asset_id::text) ORDER BY u.approved_at,a.id LIMIT 1`,
        )
      ).rows as { id: string; cleaned_asset_id: string }[];
    },
    async expireImages() {
      // Only ephemeral generation results expire; immutable moderation evidence stays.
      await pool.query(
        "UPDATE ai_autograph_requests SET result=NULL WHERE kind='generation' AND result IS NOT NULL AND created_at < now()-interval '1 hour'",
      );
    },
  };
}
export const aiFingerprint = (text: string) =>
  createHash('sha256').update(text).digest('hex');
