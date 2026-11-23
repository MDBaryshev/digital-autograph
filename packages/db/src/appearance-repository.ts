import type { Pool } from 'pg';

export type WallAppearance = {
  title: string;
  description: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
};
export type PrivateAppearance = WallAppearance & {
  providerAvatarDataUrl: string | null;
  avatarSource: 'provider' | 'upload' | 'none' | null;
};
const empty: PrivateAppearance = {
  title: '',
  description: '',
  avatarDataUrl: null,
  coverDataUrl: null,
  providerAvatarDataUrl: null,
  avatarSource: null,
};
export function createPgAppearanceRepository(pool: Pool) {
  return {
    async read(userId: string): Promise<PrivateAppearance> {
      const r = await pool.query(
        `SELECT title,description,avatar_source AS "avatarSource",avatar_data_url AS "avatarDataUrl",cover_data_url AS "coverDataUrl",provider_avatar_data_url AS "providerAvatarDataUrl" FROM account_appearance WHERE user_id=$1`,
        [userId],
      );
      return r.rows[0] ?? { ...empty };
    },
    async save(
      userId: string,
      input: WallAppearance,
      avatarSource: 'provider' | 'upload' | 'none',
    ) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const active = await c.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
          [userId],
        );
        if (active.rowCount !== 1) throw Error('FORBIDDEN');
        await c.query(
          `INSERT INTO account_appearance(user_id,title,description,avatar_data_url,cover_data_url,avatar_source,public_updated_at)
          VALUES($1,$2,$3,$4,$5,$7,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE SET title=excluded.title,description=excluded.description,
          avatar_data_url=CASE WHEN $6 THEN account_appearance.provider_avatar_data_url ELSE excluded.avatar_data_url END,
          cover_data_url=excluded.cover_data_url,avatar_source=excluded.avatar_source,
          public_updated_at=clock_timestamp(),updated_at=clock_timestamp()`,
          [
            userId,
            input.title,
            input.description,
            input.avatarDataUrl,
            input.coverDataUrl,
            avatarSource === 'provider',
            avatarSource,
          ],
        );
        if (avatarSource === 'provider')
          await c.query(
            'UPDATE account_appearance SET avatar_data_url=provider_avatar_data_url WHERE user_id=$1',
            [userId],
          );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    async saveProviderAvatar(userId: string, dataUrl: string) {
      // Private candidate only: login never replaces a published/custom avatar.
      await pool.query(
        `INSERT INTO account_appearance(user_id,provider_avatar_data_url)
        SELECT id,$2 FROM users WHERE id=$1 AND status='active'
        ON CONFLICT(user_id) DO UPDATE SET provider_avatar_data_url=excluded.provider_avatar_data_url,updated_at=clock_timestamp()`,
        [userId, dataUrl],
      );
    },
  };
}
export type AppearanceRepository = ReturnType<
  typeof createPgAppearanceRepository
>;
