import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { ModerationRejectionReason } from '@digital-autograph/domain';

export class ProfileModerationError extends Error {
  constructor(
    readonly code:
      | 'FORBIDDEN'
      | 'SLUG_TAKEN'
      | 'SUBMISSION_NOT_FOUND'
      | 'SUBMISSION_CHANGED'
      | 'OPERATION_CONFLICT'
      | 'SUBMISSION_LIMIT'
      | 'PROVIDER_AVATAR_CHANGED'
      | 'PROFILE_PUBLICATION_UNAVAILABLE'
      | 'MODERATION_ALREADY_DECIDED',
  ) {
    super(code);
  }
}

export type SubmissionMetadata = {
  operationKey?: string;
  expectedSubmissionId?: string | null;
};
type ProfileInput = { kind: 'profile'; slug: string; displayName: string };
type AppearanceInput = {
  kind: 'appearance';
  title: string;
  description: string;
  avatarSource: 'provider' | 'upload' | 'none';
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
  providerAvatarHash?: string;
};
type SubmissionRow = {
  id: string;
  user_id: string;
  kind: 'profile' | 'appearance' | 'telegram';
  version: number;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  request_hash: string;
  creator_id: string | null;
  slug: string | null;
  display_name: string | null;
  title: string | null;
  description: string | null;
  avatar_source: 'provider' | 'upload' | 'none' | null;
  avatar_data_url: string | null;
  cover_data_url: string | null;
  created_at: Date;
  reason_code?: ModerationRejectionReason | null;
  assessment?: string | null;
  suggested_reason?: ModerationRejectionReason | null;
};
export function profileContentHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function submissionView(row: SubmissionRow) {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    reasonCode: row.reason_code ?? null,
    slug: row.slug,
    displayName: row.display_name,
    title: row.title,
    description: row.description,
    avatarSource: row.avatar_source,
    avatarDataUrl: row.avatar_data_url,
    coverDataUrl: row.cover_data_url,
    ...(row.kind === 'telegram' && {
      assessment: row.assessment ?? null,
      suggestedReason: row.suggested_reason ?? null,
    }),
  };
}
export async function profileTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'creator_profiles_slug_uidx'
    ) {
      throw new ProfileModerationError('SLUG_TAKEN');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function savePrivateProviderAvatar(
  db: Pool | PoolClient,
  userId: string,
  dataUrl: string,
) {
  await db.query(
    `INSERT INTO account_appearance(user_id,provider_avatar_data_url)
     SELECT id,$2 FROM users WHERE id=$1 AND status='active'
     ON CONFLICT(user_id) DO UPDATE SET provider_avatar_data_url=excluded.provider_avatar_data_url,updated_at=clock_timestamp()`,
    [userId, dataUrl],
  );
}
async function requireModerator(
  client: PoolClient,
  actor: string,
  lockUser = true,
) {
  const role = await client.query(
    `SELECT r.user_id FROM user_roles r JOIN users u ON u.id=r.user_id
     WHERE r.user_id=$1 AND r.role IN ('moderator','admin') AND u.status='active'
     ${lockUser ? 'FOR SHARE OF u' : ''}`,
    [actor],
  );
  if (!role.rowCount) throw new ProfileModerationError('FORBIDDEN');
}

async function findOwnedCreator(client: PoolClient, userId: string) {
  const result = await client.query<{ id: string }>(
    `SELECT c.id FROM creators c LEFT JOIN creator_profiles p ON p.creator_id=c.id
     WHERE c.owner_user_id=$1 ORDER BY (p.creator_id IS NOT NULL) DESC,c.created_at,c.id LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

export function createPgProfileModerationRepository(pool: Pool) {
  return {
    async latest(userId: string, kind: 'profile' | 'appearance') {
      const result = await pool.query<SubmissionRow>(
        `SELECT s.*,d.reason_code FROM profile_submissions s
         LEFT JOIN profile_moderation_decisions d ON d.submission_id=s.id
         WHERE s.user_id=$1 AND s.kind=$2 ORDER BY s.version DESC LIMIT 1`,
        [userId, kind],
      );
      return result.rows[0] ? submissionView(result.rows[0]) : null;
    },

    async submit(
      userId: string,
      input: ProfileInput | AppearanceInput,
      metadata: SubmissionMetadata = {},
    ) {
      const requestHash = profileContentHash(JSON.stringify(input));
      return profileTransaction(pool, async (client) => {
        const active = await client.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
          [userId],
        );
        if (active.rowCount !== 1)
          throw new ProfileModerationError('FORBIDDEN');
        if (metadata.operationKey) {
          const retry = await client.query<SubmissionRow>(
            'SELECT * FROM profile_submissions WHERE user_id=$1 AND operation_key=$2',
            [userId, metadata.operationKey],
          );
          if (retry.rows[0]) {
            if (retry.rows[0].request_hash !== requestHash)
              throw new ProfileModerationError('OPERATION_CONFLICT');
            return retry.rows[0];
          }
        }
        const latest = (
          await client.query<SubmissionRow>(
            'SELECT * FROM profile_submissions WHERE user_id=$1 AND kind=$2 ORDER BY version DESC LIMIT 1',
            [userId, input.kind],
          )
        ).rows[0];
        if (
          !metadata.operationKey &&
          latest?.request_hash === requestHash &&
          ['pending', 'approved'].includes(latest.status)
        )
          return latest;
        if (
          metadata.expectedSubmissionId !== undefined &&
          metadata.expectedSubmissionId !== (latest?.id ?? null)
        )
          throw new ProfileModerationError('SUBMISSION_CHANGED');
        const count = await client.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM profile_submissions
           WHERE user_id=$1 AND kind <> 'telegram'
             AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          [userId],
        );
        if (count.rows[0]!.count >= 30)
          throw new ProfileModerationError('SUBMISSION_LIMIT');
        let creatorId: string | null = null;
        let avatar = input.kind === 'appearance' ? input.avatarDataUrl : null;
        if (input.kind === 'profile') {
          creatorId = await findOwnedCreator(client, userId);
          const collision = await client.query(
            'SELECT 1 FROM creator_profiles WHERE slug=$1 AND creator_id IS DISTINCT FROM $2::uuid',
            [input.slug, creatorId],
          );
          if (collision.rowCount)
            throw new ProfileModerationError('SLUG_TAKEN');
        } else if (input.avatarSource === 'provider') {
          const appearance = (
            await client.query<
              Pick<SubmissionRow, 'avatar_data_url' | 'avatar_source'> & {
                provider_avatar_data_url: string | null;
              }
            >(
              'SELECT avatar_data_url,avatar_source,provider_avatar_data_url FROM account_appearance WHERE user_id=$1',
              [userId],
            )
          ).rows[0];
          avatar = appearance?.provider_avatar_data_url ?? null;
          if (input.providerAvatarHash) {
            avatar =
              [
                avatar,
                latest?.avatar_source === 'provider'
                  ? latest.avatar_data_url
                  : null,
                appearance?.avatar_source === 'provider'
                  ? appearance.avatar_data_url
                  : null,
              ].find(
                (image) =>
                  image &&
                  profileContentHash(image) === input.providerAvatarHash,
              ) ?? null;
          }
          if (!avatar)
            throw new ProfileModerationError('PROVIDER_AVATAR_CHANGED');
        }
        await client.query(
          "UPDATE profile_submissions SET status='superseded' WHERE user_id=$1 AND kind=$2 AND status='pending'",
          [userId, input.kind],
        );
        const result = await client.query<SubmissionRow>(
          `INSERT INTO profile_submissions(user_id,kind,version,operation_key,request_hash,creator_id,slug,display_name,title,description,avatar_source,avatar_data_url,cover_data_url)
           VALUES($1,$2,$3,COALESCE($4::uuid,gen_random_uuid()),$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            userId,
            input.kind,
            (latest?.version ?? 0) + 1,
            metadata.operationKey ?? null,
            requestHash,
            creatorId,
            input.kind === 'profile' ? input.slug : null,
            input.kind === 'profile' ? input.displayName : null,
            input.kind === 'appearance' ? input.title : null,
            input.kind === 'appearance' ? input.description : null,
            input.kind === 'appearance' ? input.avatarSource : null,
            avatar,
            input.kind === 'appearance' ? input.coverDataUrl : null,
          ],
        );
        if (
          input.kind === 'appearance' &&
          (input.avatarSource === 'none' || input.coverDataUrl === null)
        ) {
          // An owner can withdraw an image while additions and text wait for review.
          await client.query(
            `UPDATE account_appearance SET
               avatar_data_url=CASE WHEN $2 THEN NULL ELSE avatar_data_url END,
               avatar_source=CASE WHEN $2 THEN 'none' ELSE avatar_source END,
               cover_data_url=CASE WHEN $3 THEN NULL ELSE cover_data_url END,
               updated_at=clock_timestamp()
             WHERE user_id=$1`,
            [
              userId,
              input.avatarSource === 'none',
              input.coverDataUrl === null,
            ],
          );
        }
        return result.rows[0]!;
      });
    },

    async list(actor: string, limit: number, cursor?: string) {
      return profileTransaction(pool, async (client) => {
        await requireModerator(client, actor);
        if (
          cursor &&
          !(
            await client.query(
              'SELECT 1 FROM profile_submissions WHERE id=$1',
              [cursor],
            )
          ).rowCount
        )
          throw new ProfileModerationError('SUBMISSION_NOT_FOUND');
        const result = await client.query<
          Pick<SubmissionRow, 'id' | 'kind' | 'version' | 'created_at'>
        >(
          `SELECT s.id,s.kind,s.version,s.created_at FROM profile_submissions s JOIN users u ON u.id=s.user_id
           WHERE s.status='pending' AND u.status='active'
           AND ($1::uuid IS NULL OR (s.created_at,s.id) > (SELECT created_at,id FROM profile_submissions WHERE id=$1))
           ORDER BY s.created_at,s.id LIMIT $2`,
          [cursor ?? null, limit + 1],
        );
        const items = result.rows.slice(0, limit).map((row) => ({
          id: row.id,
          kind: row.kind,
          version: row.version,
          createdAt: row.created_at,
        }));
        return {
          items,
          nextCursor: result.rows.length > limit ? items.at(-1)!.id : null,
        };
      });
    },

    async preview(actor: string, id: string) {
      return profileTransaction(pool, async (client) => {
        await requireModerator(client, actor);
        const row = (
          await client.query<SubmissionRow>(
            `SELECT s.*, t.assessment, t.reason_code AS suggested_reason
             FROM profile_submissions s JOIN users u ON u.id=s.user_id
             LEFT JOIN telegram_profile_checks t ON t.submission_id=s.id
             WHERE s.id=$1 AND s.status='pending' AND u.status='active'`,
            [id],
          )
        ).rows[0];
        if (!row) throw new ProfileModerationError('SUBMISSION_NOT_FOUND');
        return submissionView(row);
      });
    },

    async decide(
      actor: string,
      id: string,
      decision:
        | { decision: 'approved' }
        | { decision: 'rejected'; reasonCode: ModerationRejectionReason },
      publicationApproved = true,
    ) {
      return profileTransaction(pool, async (client) => {
        // Resolve authority before inspecting a private target, then lock users in one order.
        await requireModerator(client, actor, false);
        const target = (
          await client.query<{ user_id: string }>(
            'SELECT user_id FROM profile_submissions WHERE id=$1',
            [id],
          )
        ).rows[0];
        if (!target) throw new ProfileModerationError('SUBMISSION_NOT_FOUND');
        await client.query(
          'SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [[actor, target.user_id]],
        );
        await requireModerator(client, actor);
        const row = (
          await client.query<SubmissionRow>(
            'SELECT * FROM profile_submissions WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0]!;
        const prior = (
          await client.query<{ decision: string; reason_code: string | null }>(
            'SELECT decision,reason_code FROM profile_moderation_decisions WHERE submission_id=$1',
            [id],
          )
        ).rows[0];
        if (prior) {
          if (
            prior.decision !== decision.decision ||
            prior.reason_code !==
              (decision.decision === 'rejected' ? decision.reasonCode : null)
          )
            throw new ProfileModerationError('MODERATION_ALREADY_DECIDED');
          return { id, status: prior.decision };
        }
        if (row.status !== 'pending')
          throw new ProfileModerationError('SUBMISSION_CHANGED');
        const active = await client.query(
          "SELECT 1 FROM users WHERE id=$1 AND status='active'",
          [target.user_id],
        );
        if (!active.rowCount)
          throw new ProfileModerationError('SUBMISSION_CHANGED');
        if (decision.decision === 'approved') {
          if (!publicationApproved && row.kind !== 'telegram')
            throw new ProfileModerationError('PROFILE_PUBLICATION_UNAVAILABLE');
          if (row.kind === 'telegram') {
            if (row.avatar_data_url)
              await savePrivateProviderAvatar(
                client,
                row.user_id,
                row.avatar_data_url,
              );
          } else if (row.kind === 'profile') {
            // A first submission must not grant a creator identity before review.
            let creatorId =
              row.creator_id ?? (await findOwnedCreator(client, row.user_id));
            if (!creatorId) {
              const inserted = await client.query<{ id: string }>(
                'INSERT INTO creators(owner_user_id) VALUES($1) RETURNING id',
                [row.user_id],
              );
              creatorId = inserted.rows[0]!.id;
            }
            const creator = await client.query(
              'SELECT id FROM creators WHERE id=$1 AND owner_user_id=$2 FOR SHARE',
              [creatorId, row.user_id],
            );
            if (creator.rowCount !== 1)
              throw new ProfileModerationError('SUBMISSION_CHANGED');
            await client.query(
              `INSERT INTO creator_profiles(creator_id,slug,display_name) VALUES($1,$2,$3)
               ON CONFLICT(creator_id) DO UPDATE SET slug=excluded.slug,display_name=excluded.display_name,updated_at=clock_timestamp()`,
              [creatorId, row.slug, row.display_name],
            );
          } else {
            await client.query(
              `INSERT INTO account_appearance(user_id,title,description,avatar_source,avatar_data_url,cover_data_url)
               VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET title=excluded.title,
               description=excluded.description,avatar_source=excluded.avatar_source,avatar_data_url=excluded.avatar_data_url,
               cover_data_url=excluded.cover_data_url,updated_at=clock_timestamp()`,
              [
                row.user_id,
                row.title,
                row.description,
                row.avatar_source,
                row.avatar_data_url,
                row.cover_data_url,
              ],
            );
          }
        }
        await client.query(
          `INSERT INTO profile_moderation_decisions(submission_id,moderator_user_id,decision,reason_code,policy_version)
           VALUES($1,$2,$3,$4,$5)`,
          [
            id,
            actor,
            decision.decision,
            decision.decision === 'rejected' ? decision.reasonCode : null,
            row.kind === 'telegram'
              ? 'telegram-profile-human-v1'
              : 'profile-human-v1',
          ],
        );
        await client.query(
          'UPDATE profile_submissions SET status=$2 WHERE id=$1',
          [id, decision.decision],
        );
        return { id, status: decision.decision };
      });
    },
  };
}
export type ProfileModerationRepository = ReturnType<
  typeof createPgProfileModerationRepository
>;
