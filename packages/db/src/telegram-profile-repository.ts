import type { Pool } from 'pg';
import type { ModerationRejectionReason } from '@digital-autograph/domain';
import {
  profileContentHash,
  profileTransaction,
  savePrivateProviderAvatar,
} from './profile-moderation-repository';

export type TelegramProfileSnapshot = {
  name: string | null;
  username: string | null;
  avatarDataUrl: string | null;
};
type Check = {
  id: string;
  user_id: string;
  version: number;
  status: string;
  fingerprint: string;
  observed_at: Date;
  display_name: string | null;
  username: string | null;
  avatar_data_url: string | null;
};
type Assessment =
  | { kind: 'clear'; model: string }
  | { kind: 'flagged'; model: string; reason: ModerationRejectionReason }
  | { kind: 'uncertain' | 'unavailable' | 'quota'; model: string | null };

export function createPgTelegramProfileRepository(pool: Pool) {
  return {
    async enqueue(
      userId: string,
      profile: TelegramProfileSnapshot,
      observedAt: Date,
      photoUnavailable = false,
    ) {
      const { name, username, avatarDataUrl } = profile;
      if (!name && !username && !avatarDataUrl) return;
      const fingerprint = profileContentHash(
        JSON.stringify([name, username, avatarDataUrl]),
      );
      await profileTransaction(pool, async (db) => {
        const active = await db.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
          [userId],
        );
        if (!active.rowCount) return;
        const latest = (
          await db.query<
            Pick<
              Check,
              'id' | 'fingerprint' | 'version' | 'observed_at' | 'status'
            > & { has_open_photo: boolean }
          >(
            `SELECT c.id,c.fingerprint,c.version,c.observed_at,c.status,
               (c.avatar_data_url IS NOT NULL OR
                (s.status IS NOT DISTINCT FROM 'pending' AND s.avatar_data_url IS NOT NULL)) AS has_open_photo
             FROM telegram_profile_checks c LEFT JOIN profile_submissions s ON s.id=c.submission_id
             WHERE c.user_id=$1 ORDER BY c.version DESC LIMIT 1`,
            [userId],
          )
        ).rows[0];
        if (latest && latest.observed_at > observedAt) return;
        if (photoUnavailable && latest?.has_open_photo) return;
        if (
          latest?.fingerprint === fingerprint &&
          latest.status !== 'superseded'
        ) {
          await db.query(
            'UPDATE telegram_profile_checks SET observed_at=$2 WHERE id=$1 AND observed_at<$2',
            [latest.id, observedAt],
          );
          return;
        }
        await db.query(
          `UPDATE telegram_profile_checks SET status='superseded',display_name=NULL,username=NULL,
            avatar_data_url=NULL,lease_id=NULL,lease_until=NULL WHERE user_id=$1 AND status IN ('queued','running')`,
          [userId],
        );
        await db.query(
          "UPDATE profile_submissions SET status='superseded' WHERE user_id=$1 AND kind='telegram' AND status='pending'",
          [userId],
        );
        await db.query(
          `INSERT INTO telegram_profile_checks(user_id,version,fingerprint,observed_at,display_name,username,avatar_data_url)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            userId,
            (latest?.version ?? 0) + 1,
            fingerprint,
            observedAt,
            name,
            username,
            avatarDataUrl,
          ],
        );
      });
    },

    async claim() {
      return profileTransaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(176, 2)');
        await db.query(
          `UPDATE telegram_profile_checks c SET status='superseded',display_name=NULL,username=NULL,
            avatar_data_url=NULL,lease_id=NULL,lease_until=NULL FROM users u
            WHERE c.user_id=u.id AND u.status<>'active' AND c.status IN ('queued','running')`,
        );
        const check = (
          await db.query<Check>(
            `SELECT c.* FROM telegram_profile_checks c JOIN users u ON u.id=c.user_id
           WHERE (c.status='queued' OR (c.status='running' AND c.lease_until <= now())) AND u.status='active'
           ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
          )
        ).rows[0];
        if (!check) return null;
        const { count } = (
          await db.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM telegram_profile_checks
           WHERE started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          )
        ).rows[0]!;
        const lease = (
          await db.query<{ lease_id: string }>(
            `UPDATE telegram_profile_checks SET status='running',started_at=COALESCE(started_at,now()),
           lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes' WHERE id=$1 RETURNING lease_id`,
            [check.id],
          )
        ).rows[0]!;
        return {
          id: check.id,
          userId: check.user_id,
          leaseId: lease.lease_id,
          fallback:
            check.status === 'running'
              ? ('unavailable' as const)
              : count >= 200
                ? ('quota' as const)
                : null,
          profile: {
            name: check.display_name,
            username: check.username,
            avatarDataUrl: check.avatar_data_url,
          },
        };
      });
    },

    async finish(
      job: { id: string; userId: string; leaseId: string },
      assessment: Assessment,
    ) {
      await profileTransaction(pool, async (db) => {
        const active = await db.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
          [job.userId],
        );
        if (!active.rowCount) return;
        const check = (
          await db.query<Check>(
            `SELECT * FROM telegram_profile_checks WHERE id=$1 AND user_id=$2 AND status='running'
            AND lease_id=$3 AND lease_until>now() FOR UPDATE`,
            [job.id, job.userId, job.leaseId],
          )
        ).rows[0];
        if (!check) return;
        let submissionId: string | null = null;
        if (assessment.kind === 'clear') {
          if (check.avatar_data_url)
            await savePrivateProviderAvatar(
              db,
              job.userId,
              check.avatar_data_url,
            );
        } else {
          const created = await db.query<{ id: string }>(
            `INSERT INTO profile_submissions(user_id,kind,version,request_hash,display_name,slug,avatar_data_url)
             VALUES($1,'telegram',$2,$3,$4,$5,$6) RETURNING id`,
            [
              job.userId,
              check.version,
              check.fingerprint,
              check.display_name,
              check.username,
              check.avatar_data_url,
            ],
          );
          submissionId = created.rows[0]!.id;
        }
        await db.query(
          `UPDATE telegram_profile_checks SET status=$2,display_name=NULL,username=NULL,avatar_data_url=NULL,
             lease_id=NULL,lease_until=NULL,model=$3,assessment=$4,reason_code=$5,submission_id=$6 WHERE id=$1`,
          [
            job.id,
            submissionId ? 'review' : 'cleared',
            assessment.model,
            assessment.kind,
            assessment.kind === 'flagged' ? assessment.reason : null,
            submissionId,
          ],
        );
      });
    },

    async status(userId: string) {
      const result = await pool.query<{
        status:
          | 'queued'
          | 'running'
          | 'cleared'
          | 'pending'
          | 'approved'
          | 'rejected'
          | 'superseded';
        reasonCode: ModerationRejectionReason | null;
      }>(
        `SELECT COALESCE(s.status,c.status) AS status, d.reason_code AS "reasonCode"
         FROM telegram_profile_checks c LEFT JOIN profile_submissions s ON s.id=c.submission_id
         LEFT JOIN profile_moderation_decisions d ON d.submission_id=s.id
         WHERE c.user_id=$1 ORDER BY c.version DESC LIMIT 1`,
        [userId],
      );
      const review = result.rows[0];
      if (!review || review.status === 'superseded') return null;
      return { status: review.status, reasonCode: review.reasonCode };
    },
  };
}

export type TelegramProfileRepository = ReturnType<
  typeof createPgTelegramProfileRepository
>;
