import type { Pool } from 'pg';
import type { AdminRecordKind } from '@digital-autograph/domain';

export class AdminLookupForbidden extends Error {
  constructor() {
    super('FORBIDDEN');
  }
}

type RecordView = {
  kind: AdminRecordKind;
  id: string;
  state: string | null;
  createdAt: string;
};

export function createPgAdminLookupRepository(pool: Pick<Pool, 'query'>) {
  return {
    async lookup(
      actorId: string,
      id?: string,
    ): Promise<{ items: RecordView[] }> {
      // One statement snapshot authorizes this read. Every candidate is a PK
      // equality lookup; a probe with NULL cannot enumerate any table.
      const { rows } = await pool.query<{
        allowed: boolean;
        items: RecordView[];
      }>(
        `WITH actor AS MATERIALIZED (
           SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
           WHERE r.user_id = $1::uuid AND r.role = 'admin' AND u.status = 'active'
         ), matches AS (
           SELECT 'user' AS kind, id, status::text AS state, created_at AS "createdAt"
             FROM users WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
           UNION ALL
           SELECT 'creator', id, NULL::text, created_at FROM creators
             WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
           UNION ALL
           SELECT 'wall', id, status::text, created_at FROM walls
             WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
           UNION ALL
           SELECT 'autograph', id, status::text, created_at FROM autographs
             WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
           UNION ALL
           SELECT 'order', id, status::text, created_at FROM payment_orders
             WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
           UNION ALL
           SELECT 'payment', id, status::text, created_at FROM payments
             WHERE id = $2::uuid AND EXISTS (SELECT 1 FROM actor)
         )
         SELECT EXISTS (SELECT 1 FROM actor) AS allowed,
           COALESCE((SELECT json_agg(matches ORDER BY kind) FROM matches), '[]'::json) AS items`,
        [actorId, id ?? null],
      );
      if (!rows[0]?.allowed) throw new AdminLookupForbidden();
      return { items: rows[0].items };
    },
  };
}
export type AdminLookupRepository = ReturnType<
  typeof createPgAdminLookupRepository
>;
