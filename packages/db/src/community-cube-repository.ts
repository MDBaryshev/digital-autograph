import { AutographError } from '@digital-autograph/autographs';
import {
  communityCubeCapacity,
  communityCubeMaxGeneration,
  isAutographPlacementEligible,
} from '@digital-autograph/domain';
import type { Pool, PoolClient } from 'pg';
import {
  verifyAutographEvidence,
  type EvidenceAutograph,
} from './autograph-evidence';

type PlacementRow = {
  id: string;
  autograph_id: string;
  generation: number;
  cell: number;
  withdrawn_at: Date | null;
};

type PlacementInput = {
  userId: string;
  autographId: string;
  requestId: string;
  generation: number;
  cell: number;
};

export class CommunityCubeError extends Error {
  constructor(
    readonly code:
      | 'AUTOGRAPH_NOT_AVAILABLE'
      | 'CUBE_ALREADY_PLACED'
      | 'CUBE_GENERATION_CHANGED'
      | 'CUBE_CELL_OCCUPIED'
      | 'CUBE_REQUEST_CONFLICT'
      | 'CUBE_FULL',
  ) {
    super(code);
  }
}

const placementColumns = 'id, autograph_id, generation, cell, withdrawn_at';

function placementView(placement: PlacementRow) {
  return {
    id: placement.id,
    autographId: placement.autograph_id,
    cell: placement.cell,
  };
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  mode: 'write' | 'read' = 'write',
) {
  const client = await pool.connect();
  try {
    await client.query(
      mode === 'read'
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN',
    );
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lockCube(client: PoolClient) {
  const { rows } = await client.query<{ generation: number }>(
    'SELECT generation FROM community_cube_state WHERE id = 1 FOR UPDATE',
  );
  if (!rows[0]) throw new Error('Community cube state missing');
  return rows[0].generation;
}

async function activePlaces(client: PoolClient) {
  const { rows } = await client.query<{ occupied: number }>(
    'SELECT count(*)::int AS occupied FROM community_cube_placements WHERE withdrawn_at IS NULL',
  );
  return rows[0]!.occupied;
}

async function readEligibleAsset(
  client: PoolClient,
  userId: string,
  autographId: string,
  lock = true,
) {
  const { rows } = await client.query<EvidenceAutograph>(
    `SELECT a.id, a.user_id, a.status FROM autographs a
     JOIN users u ON u.id = a.user_id AND u.status = 'active'
     WHERE a.user_id = $1::uuid AND a.id = $2::uuid
     ${lock ? 'FOR SHARE OF a, u' : ''}`,
    [userId, autographId],
  );
  const autograph = rows[0];
  if (!autograph || !isAutographPlacementEligible(autograph.status))
    return null;
  try {
    const { cleaned } = await verifyAutographEvidence(client, autograph, lock);
    if (!cleaned) return null;
    // Read only the immutable derivative whose ID matches the approval and decision.
    const { rows: assets } = await client.query<{
      verified_size_bytes: number;
    }>(
      `SELECT verified_size_bytes FROM autograph_assets
       WHERE id = $1::uuid AND role = 'cleaned' AND retired_at IS NULL
         AND actual_content_type = 'image/png'
         AND verified_size_bytes BETWEEN 1 AND 10485760
         AND width BETWEEN 1 AND 2048 AND height BETWEEN 1 AND 2048`,
      [cleaned.id],
    );
    if (!assets[0]) return null;
    return {
      storageKey: cleaned.storage_key,
      verifiedSizeBytes: assets[0].verified_size_bytes,
    };
  } catch (error) {
    if (error instanceof AutographError) return null;
    throw error;
  }
}

export function createPgCommunityCubeRepository(pool: Pool) {
  return {
    async snapshot() {
      const { rows } = await pool.query<{
        generation: number;
        occupied_cells: number[];
      }>(
        `SELECT s.generation, ARRAY(
           SELECT p.cell FROM community_cube_placements p
           WHERE p.withdrawn_at IS NULL ORDER BY p.cell
         ) AS occupied_cells FROM community_cube_state s WHERE s.id = 1`,
      );
      const row = rows[0];
      if (!row) throw new Error('Community cube state missing');
      return {
        generation: row.generation,
        capacity: communityCubeCapacity(row.generation),
        occupiedCells: row.occupied_cells,
      };
    },

    async getOwn(userId: string) {
      const { rows } = await pool.query<PlacementRow>(
        `SELECT ${placementColumns} FROM community_cube_placements
         WHERE user_id = $1::uuid AND withdrawn_at IS NULL`,
        [userId],
      );
      return rows[0] ? placementView(rows[0]) : null;
    },

    async place(input: PlacementInput) {
      return transaction(pool, async (client) => {
        // Serializes placement, withdrawal and frontier growth across API replicas.
        const generation = await lockCube(client);
        const { rows: requests } = await client.query<PlacementRow>(
          `SELECT ${placementColumns} FROM community_cube_placements
           WHERE user_id = $1::uuid AND request_id = $2::uuid`,
          [input.userId, input.requestId],
        );
        const previous = requests[0];
        if (previous) {
          if (
            previous.withdrawn_at ||
            previous.autograph_id !== input.autographId ||
            previous.generation !== input.generation ||
            previous.cell !== input.cell
          ) {
            throw new CommunityCubeError('CUBE_REQUEST_CONFLICT');
          }
          return { placement: placementView(previous), created: false };
        }

        const capacity = communityCubeCapacity(generation);
        if (input.generation !== generation || input.cell > capacity) {
          throw new CommunityCubeError('CUBE_GENERATION_CHANGED');
        }
        if (
          !(await readEligibleAsset(client, input.userId, input.autographId))
        ) {
          throw new CommunityCubeError('AUTOGRAPH_NOT_AVAILABLE');
        }
        const occupied = await activePlaces(client);
        if (occupied >= capacity) throw new CommunityCubeError('CUBE_FULL');

        const { rows: conflicts } = await client.query<{ user_id: string }>(
          `SELECT user_id FROM community_cube_placements
           WHERE withdrawn_at IS NULL AND (user_id = $1::uuid OR cell = $2)`,
          [input.userId, input.cell],
        );
        if (conflicts.some((placement) => placement.user_id === input.userId)) {
          throw new CommunityCubeError('CUBE_ALREADY_PLACED');
        }
        if (conflicts.length)
          throw new CommunityCubeError('CUBE_CELL_OCCUPIED');

        const { rows } = await client.query<PlacementRow>(
          `INSERT INTO community_cube_placements
             (user_id, autograph_id, request_id, generation, cell)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
           RETURNING ${placementColumns}`,
          [
            input.userId,
            input.autographId,
            input.requestId,
            generation,
            input.cell,
          ],
        );
        if (
          occupied + 1 === capacity &&
          generation < communityCubeMaxGeneration
        ) {
          await client.query(
            'UPDATE community_cube_state SET generation = generation + 1 WHERE id = 1',
          );
        }
        return { placement: placementView(rows[0]!), created: true };
      });
    },

    async withdraw(userId: string, placementId: string) {
      return transaction(pool, async (client) => {
        await lockCube(client);
        const { rowCount } = await client.query(
          `UPDATE community_cube_placements
           SET withdrawn_at = COALESCE(withdrawn_at, clock_timestamp())
           WHERE user_id = $1::uuid AND id = $2::uuid`,
          [userId, placementId],
        );
        return rowCount === 1;
      });
    },

    async resolveMedia(cell: number) {
      // Use one consistent snapshot for the placement and approval evidence.
      // Row locks here could conflict with an account or autograph deletion cascading to the placement.
      return transaction(
        pool,
        async (client) => {
          const { rows } = await client.query<{
            id: string;
            user_id: string;
            autograph_id: string;
          }>(
            `SELECT id, user_id, autograph_id FROM community_cube_placements
             WHERE cell = $1 AND withdrawn_at IS NULL`,
            [cell],
          );
          const placement = rows[0];
          if (!placement) return null;
          const asset = await readEligibleAsset(
            client,
            placement.user_id,
            placement.autograph_id,
            false,
          );
          return asset && { ...asset, placementId: placement.id };
        },
        'read',
      );
    },
  };
}

export type CommunityCubeRepository = ReturnType<
  typeof createPgCommunityCubeRepository
>;
