import type { Pool } from 'pg';

const publicStatuses = "('scheduled', 'live', 'paused', 'ended')";

type FeedMode = 'for-you' | 'following';
type FollowState = 'guest' | 'self' | 'following' | 'not-following';

export type WallFeedPosition = {
  score: number;
  activityAt: Date;
  id: string;
};

type FeedRow = WallFeedPosition & {
  slug: string;
  displayName: string;
  title: string;
  status: 'scheduled' | 'live' | 'paused' | 'ended';
  slotCount: number;
  occupiedCount: number;
  activityKind: 'placement' | 'wall';
  reason: 'following' | 'signed' | 'related' | 'discovery';
};

const rankedWalls = `
  WITH eligible AS NOT MATERIALIZED (
    SELECT w.*, cp.slug, cp.display_name, c.owner_user_id AS profile_owner
    FROM walls w
    JOIN creator_profiles cp ON cp.creator_id = w.creator_id
    JOIN creators c ON c.id = cp.creator_id
    JOIN users owner ON owner.id = c.owner_user_id AND owner.status = 'active'
    WHERE w.status IN ${publicStatuses}
  ),
  follows AS MATERIALIZED (
    SELECT creator_id, created_at FROM creator_follows WHERE follower_user_id = $1
  ),
  mine AS MATERIALIZED (
    SELECT s.wall_id, max(p.started_at) AS signed_at
    FROM (
      SELECT slot_id, started_at FROM placements
      WHERE user_id = $1 AND $2 = 'for-you'
      ORDER BY started_at DESC, id DESC LIMIT 200
    ) p JOIN slots s ON s.id = p.slot_id
    GROUP BY s.wall_id
  ),
  anchors AS (
    SELECT e.id FROM eligible e
    LEFT JOIN follows f ON f.creator_id = e.creator_id
    LEFT JOIN mine m ON m.wall_id = e.id
    WHERE $2 = 'for-you' AND (f.creator_id IS NOT NULL OR m.wall_id IS NOT NULL)
    ORDER BY greatest(f.created_at, m.signed_at) DESC, e.id DESC LIMIT 20
  ),
  peers AS MATERIALIZED (
    SELECT p.user_id
    FROM anchors anchor
    JOIN slots s ON s.wall_id = anchor.id
    JOIN placements p ON p.slot_id = s.id AND p.ended_at IS NULL
    JOIN autographs a ON a.id = p.autograph_id AND a.user_id = p.user_id AND a.status = 'ready'
    JOIN users u ON u.id = p.user_id AND u.status = 'active'
    WHERE p.user_id IS DISTINCT FROM $1
    GROUP BY p.user_id
    ORDER BY max(p.started_at) DESC, p.user_id LIMIT 100
  ),
  related AS MATERIALIZED (
    SELECT e.id, count(DISTINCT peer.user_id)::integer AS shared
    FROM peers peer
    CROSS JOIN LATERAL (
      SELECT p.slot_id FROM placements p
      JOIN autographs a ON a.id = p.autograph_id AND a.user_id = p.user_id AND a.status = 'ready'
      WHERE p.user_id = peer.user_id AND p.ended_at IS NULL
      ORDER BY p.started_at DESC, p.id DESC LIMIT 30
    ) recent
    JOIN slots s ON s.id = recent.slot_id
    JOIN eligible e ON e.id = s.wall_id AND e.discoverable
    GROUP BY e.id
    ORDER BY shared DESC, e.id DESC LIMIT 100
  ),
  discovery AS (
    SELECT id FROM eligible
    WHERE $2 = 'for-you' AND discoverable
    ORDER BY updated_at DESC, id DESC LIMIT 200
  ),
  candidate_ids AS (
    SELECT e.id FROM eligible e JOIN follows f ON f.creator_id = e.creator_id
    UNION SELECT wall_id FROM mine
    UNION SELECT id FROM related
    UNION SELECT id FROM discovery
  ),
  activity AS (
    SELECT e.id, e.slug, e.display_name, e.status, e.slot_count, e.start_at, e.end_at,
      coalesce(ap.title, '') AS title, f.creator_id IS NOT NULL AS followed,
      m.signed_at, coalesce(r.shared, 0) AS shared,
      active.occupied,
      date_trunc('milliseconds', greatest(e.updated_at, ap.public_updated_at, h.changed_at)) AS activity_at,
      CASE WHEN h.changed_at > greatest(e.updated_at, ap.public_updated_at)
        THEN 'placement' ELSE 'wall' END AS activity_kind
    FROM candidate_ids candidates
    JOIN eligible e ON e.id = candidates.id
    LEFT JOIN follows f ON f.creator_id = e.creator_id
    LEFT JOIN mine m ON m.wall_id = e.id
    LEFT JOIN related r ON r.id = e.id
    LEFT JOIN account_appearance ap ON ap.user_id = e.profile_owner
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS occupied FROM slots s
      JOIN placements p ON p.slot_id = s.id AND p.ended_at IS NULL
      WHERE s.wall_id = e.id
    ) active
    CROSS JOIN LATERAL (
      SELECT max(greatest(recent.started_at, recent.ended_at)) AS changed_at
      FROM slots s
      CROSS JOIN LATERAL (
        SELECT started_at, ended_at FROM placements
        WHERE slot_id = s.id ORDER BY started_at DESC, id DESC LIMIT 12
      ) recent
      WHERE s.wall_id = e.id
    ) h
    WHERE e.profile_owner IS DISTINCT FROM $1
  ),
  ranked AS (
    SELECT *,
      CASE WHEN $2 = 'following' THEN 0 ELSE (
        CASE WHEN followed THEN 100 ELSE 0 END
        + CASE WHEN signed_at IS NULL THEN 0 ELSE
            greatest(0, 45 - floor(greatest(0, extract(epoch FROM ($3::timestamptz - signed_at))) / 172800)) END
        + least(32, 4 * shared)
        + greatest(0, 21 - floor(greatest(0, extract(epoch FROM ($3::timestamptz - activity_at))) / 86400))
        + CASE WHEN status = 'live' AND (start_at IS NULL OR start_at <= $3)
            AND (end_at IS NULL OR end_at > $3) THEN 6 ELSE 0 END
      )::integer END AS score
    FROM activity
  )
  SELECT id, slug, display_name AS "displayName", title, status,
    slot_count AS "slotCount", occupied AS "occupiedCount", activity_at AS "activityAt",
    activity_kind AS "activityKind", score,
    CASE WHEN followed THEN 'following' WHEN signed_at IS NOT NULL THEN 'signed'
      WHEN shared > 0 THEN 'related' ELSE 'discovery' END AS reason
  FROM ranked
  WHERE $5::integer IS NULL OR (score, activity_at, id) < ($5, $6::timestamptz, $7::uuid)
  ORDER BY score DESC, activity_at DESC, id DESC LIMIT $4
`;

export function createPgWallFeedRepository(pool: Pool) {
  async function readFollow(userId: string | null, slug: string) {
    const result = await pool.query<{ state: FollowState }>(
      `SELECT CASE
        WHEN $1::uuid IS NULL THEN 'guest'
        WHEN c.owner_user_id = $1 THEN 'self'
        WHEN f.follower_user_id IS NOT NULL THEN 'following'
        ELSE 'not-following' END AS state
       FROM creator_profiles cp
       JOIN creators c ON c.id = cp.creator_id
       JOIN users owner ON owner.id = c.owner_user_id AND owner.status = 'active'
       LEFT JOIN creator_follows f ON f.creator_id = c.id AND f.follower_user_id = $1
       WHERE cp.slug = $2`,
      [userId, slug],
    );
    return result.rows[0]?.state ?? null;
  }

  return {
    readFollow,

    async setFollow(userId: string, slug: string, following: boolean) {
      if (following) {
        await pool.query(
          `INSERT INTO creator_follows(follower_user_id, creator_id)
           SELECT actor.id, c.id
           FROM creator_profiles cp
           JOIN creators c ON c.id = cp.creator_id
           JOIN users owner ON owner.id = c.owner_user_id AND owner.status = 'active'
           JOIN users actor ON actor.id = $1 AND actor.status = 'active'
           WHERE cp.slug = $2 AND owner.id <> actor.id
           ON CONFLICT (follower_user_id, creator_id) DO NOTHING`,
          [userId, slug],
        );
      } else {
        await pool.query(
          `DELETE FROM creator_follows f USING creator_profiles cp
           WHERE f.follower_user_id = $1 AND cp.slug = $2 AND f.creator_id = cp.creator_id`,
          [userId, slug],
        );
      }
      return readFollow(userId, slug);
    },

    async discovery(userId: string, wallId: string) {
      const result = await pool.query<{ discoverable: boolean }>(
        'SELECT discoverable FROM walls WHERE id = $1 AND owner_user_id = $2',
        [wallId, userId],
      );
      return result.rows[0] ?? null;
    },

    async setDiscovery(userId: string, wallId: string, discoverable: boolean) {
      const result = await pool.query<{ discoverable: boolean }>(
        `UPDATE walls SET discoverable = $3
         WHERE id = $1 AND owner_user_id = $2
           AND (NOT $3 OR status IN ${publicStatuses})
         RETURNING discoverable`,
        [wallId, userId, discoverable],
      );
      return result.rows[0] ?? null;
    },

    async list(input: {
      userId: string | null;
      mode: FeedMode;
      asOf: Date;
      limit: number;
      after?: WallFeedPosition;
    }) {
      const result = await pool.query<FeedRow>(rankedWalls, [
        input.userId,
        input.mode,
        input.asOf,
        input.limit,
        input.after?.score ?? null,
        input.after?.activityAt ?? null,
        input.after?.id ?? null,
      ]);
      return result.rows;
    },
  };
}

export type WallFeedRepository = ReturnType<typeof createPgWallFeedRepository>;
