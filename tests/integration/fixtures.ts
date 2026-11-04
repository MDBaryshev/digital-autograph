import {
  creators,
  placements,
  slots,
  socialIdentities,
  users,
  walls,
} from '../../packages/db/src/schema';
import type { Database } from '../../packages/db/src/index';
import { randomUUID } from 'node:crypto';

// Tests of fan/quote behavior may need several Walls. Each extra Wall now needs
// its own synthetic owner; the fan can still participate in all of them.
export async function distinctWallOwner(database: Database, preferred: string) {
  const existing = await database.pool.query(
    'SELECT 1 FROM walls WHERE owner_user_id=$1',
    [preferred],
  );
  if (!existing.rowCount) return preferred;
  const id = randomUUID();
  await database.pool.query('INSERT INTO users(id) VALUES($1)', [id]);
  return id;
}

export async function slotForWall(
  database: Database,
  wallId: string,
  position = 0,
) {
  const result = await database.pool.query<typeof slots.$inferSelect>(
    'SELECT id,wall_id AS "wallId",position,created_at AS "createdAt" FROM slots WHERE wall_id=$1 AND position=$2',
    [wallId, position],
  );
  if (!result.rows[0]) throw Error('Expected a database-created Wall slot');
  return result.rows[0];
}

// Explicit IDs make relationships and failure cases repeatable; production IDs default to PostgreSQL.
export function fixtureId(number: number): string {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

export function userFixture(number: number): typeof users.$inferInsert {
  return { id: fixtureId(1000 + number) };
}

export function socialIdentityFixture(
  userId: string,
  number: number,
): typeof socialIdentities.$inferInsert {
  return {
    id: fixtureId(2000 + number),
    userId,
    provider: 'google',
    providerUserId: `provider-user-${number}`,
  };
}

export function creatorFixture(
  number: number,
  ownerUserId?: string,
): typeof creators.$inferInsert {
  return { id: fixtureId(3000 + number), ownerUserId };
}

export function wallFixture(
  creatorId: string,
  number: number,
): typeof walls.$inferInsert {
  return { id: fixtureId(4000 + number), creatorId, slotCount: 10 };
}

export function slotFixture(
  wallId: string,
  number: number,
  position = 0,
): typeof slots.$inferInsert {
  return { id: fixtureId(5000 + number), wallId, position };
}

export function placementFixture(
  slotId: string,
  userId: string,
  number: number,
): typeof placements.$inferInsert {
  return {
    id: fixtureId(6000 + number),
    slotId,
    userId,
    source: 'free_claim',
  };
}
