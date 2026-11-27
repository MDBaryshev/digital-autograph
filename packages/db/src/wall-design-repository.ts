import { createHash, randomBytes } from 'node:crypto';
import { emptyWallDesign, type WallDesign } from '@digital-autograph/domain';
import type { Pool } from 'pg';
import type { WallAppearance } from './appearance-repository';

export class WallDesignError extends Error {
  constructor(
    readonly code:
      | 'WALL_NOT_FOUND'
      | 'DESIGN_CHANGED'
      | 'TEMPLATE_NOT_FOUND'
      | 'AUTHOR_NOT_FOUND'
      | 'FORBIDDEN',
  ) {
    super(code);
  }
}

type DesignState = { design: WallDesign; revision: string | null };
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export function createPgWallDesignRepository(pool: Pool) {
  return {
    async read(userId: string, wallId: string): Promise<DesignState> {
      const result = await pool.query<{
        design: WallDesign | null;
        revision: string | null;
        legacy: WallAppearance | null;
      }>(
        `SELECT d.design, d.revision,
                CASE WHEN ap.user_id IS NOT NULL THEN jsonb_build_object(
                  'title', ap.title, 'description', ap.description,
                  'avatarDataUrl', ap.avatar_data_url,
                  'coverDataUrl', ap.cover_data_url)
                END AS legacy
           FROM walls w
           JOIN creators c ON c.id = w.creator_id
           LEFT JOIN wall_designs d ON d.wall_id = w.id
           LEFT JOIN account_appearance ap ON ap.user_id = c.owner_user_id
          WHERE w.id = $1 AND c.owner_user_id = $2 AND w.status <> 'archived'`,
        [wallId, userId],
      );
      const row = result.rows[0];
      if (!row) throw new WallDesignError('WALL_NOT_FOUND');
      return {
        design: row.design ?? { ...emptyWallDesign, ...row.legacy },
        revision: row.revision,
      };
    },

    async save(
      userId: string,
      wallId: string,
      state: DesignState,
    ): Promise<DesignState> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const owned = await client.query(
          `SELECT w.id FROM walls w JOIN creators c ON c.id = w.creator_id
             JOIN users u ON u.id = c.owner_user_id AND u.status = 'active'
            WHERE w.id = $1 AND c.owner_user_id = $2 AND w.status <> 'archived'
            FOR UPDATE OF w FOR SHARE OF c, u`,
          [wallId, userId],
        );
        if (owned.rowCount !== 1) throw new WallDesignError('WALL_NOT_FOUND');
        const existing = await client.query<{ revision: string }>(
          'SELECT revision FROM wall_designs WHERE wall_id = $1',
          [wallId],
        );
        if ((existing.rows[0]?.revision ?? null) !== state.revision)
          throw new WallDesignError('DESIGN_CHANGED');
        const saved = await client.query<{ revision: string }>(
          `INSERT INTO wall_designs (wall_id, design) VALUES ($1, $2)
           ON CONFLICT (wall_id) DO UPDATE SET design = excluded.design,
             revision = gen_random_uuid(), updated_at = clock_timestamp()
           RETURNING revision`,
          [wallId, JSON.stringify(state.design)],
        );
        await client.query('COMMIT');
        return { design: state.design, revision: saved.rows[0]!.revision };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async isAdmin(userId: string): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
          WHERE r.user_id = $1 AND r.role = 'admin' AND u.status = 'active'`,
        [userId],
      );
      return result.rowCount === 1;
    },

    async createTemplate(adminId: string, author: string, design: WallDesign) {
      const token = randomBytes(32).toString('base64url');
      const result = await pool.query<{
        allowed: boolean;
        expires_at: Date | null;
      }>(
        `WITH admin AS (
           SELECT u.id FROM user_roles r JOIN users u ON u.id = r.user_id
            WHERE r.user_id = $1 AND r.role = 'admin' AND u.status = 'active'
         ), inserted AS (
           INSERT INTO wall_design_templates
              (token_hash, author_user_id, created_by, design, expires_at)
           SELECT $2, u.id, admin.id, $4, clock_timestamp() + interval '7 days'
             FROM admin CROSS JOIN creator_profiles cp
             JOIN creators c ON c.id = cp.creator_id
             JOIN users u ON u.id = c.owner_user_id AND u.status = 'active'
            WHERE cp.slug = $3
           RETURNING expires_at
         )
         SELECT EXISTS (SELECT 1 FROM admin) AS allowed,
                (SELECT expires_at FROM inserted) AS expires_at`,
        [adminId, hashToken(token), author, JSON.stringify(design)],
      );
      const row = result.rows[0]!;
      if (!row.allowed) throw new WallDesignError('FORBIDDEN');
      if (!row.expires_at) throw new WallDesignError('AUTHOR_NOT_FOUND');
      return { token, expiresAt: row.expires_at };
    },

    async previewTemplate(
      userId: string,
      wallId: string,
      token: string,
    ): Promise<WallDesign> {
      const result = await pool.query<{ design: WallDesign }>(
        `SELECT t.design FROM wall_design_templates t
           JOIN walls w ON w.id = $2 AND w.status <> 'archived'
           JOIN creators c ON c.id = w.creator_id AND c.owner_user_id = t.author_user_id
          WHERE t.token_hash = $1 AND t.author_user_id = $3
            AND t.expires_at > clock_timestamp()`,
        [hashToken(token), wallId, userId],
      );
      const row = result.rows[0];
      if (!row) throw new WallDesignError('TEMPLATE_NOT_FOUND');
      return row.design;
    },
  };
}

export type WallDesignRepository = ReturnType<
  typeof createPgWallDesignRepository
>;
