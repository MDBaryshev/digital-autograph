import type { Pool } from 'pg';
import type { AutographStatus, WallStatus } from '@digital-autograph/domain';
import { createPgTelegramProfileRepository } from './telegram-profile-repository';
import {
  createPgProfileModerationRepository,
  type SubmissionMetadata,
} from './profile-moderation-repository';
export { ProfileModerationError as AccountWorkspaceError } from './profile-moderation-repository';
type Profile = {
  id: string;
  slug: string;
  displayName: string;
  avatarDataUrl: string | null;
};
export function createPgAccountWorkspaceRepository(pool: Pool) {
  const moderation = createPgProfileModerationRepository(pool);
  const telegramProfiles = createPgTelegramProfileRepository(pool);
  return {
    async read(userId: string) {
      const profile = await pool.query<Profile>(
        `SELECT c.id,p.slug,p.display_name AS "displayName",CASE WHEN ap.avatar_source='none' THEN NULL ELSE COALESCE(ap.avatar_data_url,ap.provider_avatar_data_url) END AS "avatarDataUrl" FROM creators c JOIN creator_profiles p ON p.creator_id=c.id LEFT JOIN account_appearance ap ON ap.user_id=c.owner_user_id WHERE c.owner_user_id=$1 ORDER BY c.created_at,c.id LIMIT 1`,
        [userId],
      );
      const autographs = await pool.query<{
        id: string;
        source: 'canvas' | 'photo';
        status: AutographStatus;
        createdAt: Date;
      }>(
        'SELECT id,source,status,created_at AS "createdAt" FROM autographs WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',
        [userId],
      );
      const walls = await pool.query<{
        id: string;
        status: WallStatus;
        slotCount: number;
        createdAt: Date;
      }>(
        'SELECT w.id,w.status,w.slot_count AS "slotCount",w.created_at AS "createdAt" FROM walls w JOIN creators c ON c.id=w.creator_id WHERE c.owner_user_id=$1 ORDER BY w.created_at DESC,w.id DESC LIMIT 50',
        [userId],
      );
      const roles = await pool.query(
        "SELECT role FROM user_roles WHERE user_id=$1 AND role IN ('moderator','admin')",
        [userId],
      );
      return {
        profile: profile.rows[0] ?? null,
        profileSubmission: await moderation.latest(userId, 'profile'),
        telegramReview: await telegramProfiles.status(userId),
        autographs: autographs.rows,
        walls: walls.rows,
        canModerate: (roles.rowCount ?? 0) > 0,
      };
    },
    async saveProfile(
      userId: string,
      body: { displayName: string; slug: string } & SubmissionMetadata,
    ) {
      const row = await moderation.submit(
        userId,
        { kind: 'profile', displayName: body.displayName, slug: body.slug },
        body,
      );
      return {
        id: row.creator_id,
        slug: row.slug,
        displayName: row.display_name,
        submissionId: row.id,
        status: row.status,
      };
    },
  };
}
export type AccountWorkspaceRepository = ReturnType<
  typeof createPgAccountWorkspaceRepository
>;
