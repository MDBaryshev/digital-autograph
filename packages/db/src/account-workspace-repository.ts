import type { Pool } from 'pg';
import type { AutographStatus, WallStatus } from '@digital-autograph/domain';
export class AccountWorkspaceError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'SLUG_TAKEN') {
    super(code);
  }
}
type Profile = {
  id: string;
  slug: string;
  displayName: string;
  avatarDataUrl: string | null;
};
export function createPgAccountWorkspaceRepository(pool: Pool) {
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
        autographs: autographs.rows,
        walls: walls.rows,
        canModerate: (roles.rowCount ?? 0) > 0,
        canManageWallDesigns: roles.rows.some(({ role }) => role === 'admin'),
      };
    },
    async saveProfile(
      userId: string,
      body: { displayName: string; slug: string },
    ) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize every profile writer for this owner, and reject inactive users under lock.
        const active = await client.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
          [userId],
        );
        if (active.rowCount !== 1) throw new AccountWorkspaceError('FORBIDDEN');
        // Prefer the same profiled creator returned by read(); only reuse a bare creator if none has a profile.
        const found = await client.query(
          'SELECT c.id FROM creators c LEFT JOIN creator_profiles p ON p.creator_id=c.id WHERE c.owner_user_id=$1 ORDER BY (p.creator_id IS NOT NULL) DESC,c.created_at,c.id LIMIT 1',
          [userId],
        );
        const creator =
          found.rows[0] ??
          (
            await client.query(
              'INSERT INTO creators(owner_user_id) VALUES ($1) RETURNING id',
              [userId],
            )
          ).rows[0];
        await client.query(
          'INSERT INTO creator_profiles(creator_id,slug,display_name) VALUES ($1,$2,$3) ON CONFLICT(creator_id) DO UPDATE SET slug=excluded.slug,display_name=excluded.display_name,updated_at=clock_timestamp()',
          [creator.id, body.slug, body.displayName],
        );
        await client.query('COMMIT');
        return { id: creator.id, ...body };
      } catch (error) {
        await client.query('ROLLBACK');
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        )
          throw new AccountWorkspaceError('SLUG_TAKEN');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type AccountWorkspaceRepository = ReturnType<
  typeof createPgAccountWorkspaceRepository
>;
