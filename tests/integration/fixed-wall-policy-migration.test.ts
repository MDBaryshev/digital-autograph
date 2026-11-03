import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase, migrate } from '../../packages/db/src/index';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/autograph_test' ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname)
)
  throw Error('Isolated local test database required');
const folder = resolve('packages/db/drizzle');

it.each(['compatible', 'nine-places', 'duplicate-owner'] as const)(
  'upgrades %s data atomically without choosing or deleting history',
  async (kind) => {
    const control = createDatabase(url!);
    const name = 'wall_policy_' + randomUUID().replaceAll('-', '');
    const target = new URL(url!);
    target.pathname = '/' + name;
    const db = createDatabase(target.href);
    const temp = await mkdtemp(join(tmpdir(), 'destka-wall-policy-migration-'));
    try {
      await control.pool.query(`CREATE DATABASE ${name}`);
      const journal = JSON.parse(
        await readFile(join(folder, 'meta/_journal.json'), 'utf8'),
      );
      const before = {
        ...journal,
        entries: journal.entries.filter((e: { idx: number }) => e.idx < 25),
      };
      await mkdir(join(temp, 'meta'));
      await writeFile(join(temp, 'meta/_journal.json'), JSON.stringify(before));
      for (const entry of before.entries)
        await copyFile(
          join(folder, entry.tag + '.sql'),
          join(temp, entry.tag + '.sql'),
        );
      await migrate(db.db, { migrationsFolder: temp });
      const owner = (
        await db.pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')
      ).rows[0].id;
      const creator = (
        await db.pool.query(
          'INSERT INTO creators(owner_user_id) VALUES($1) RETURNING id',
          [owner],
        )
      ).rows[0].id;
      const count = kind === 'nine-places' ? 9 : 10;
      const wall = (
        await db.pool.query(
          'INSERT INTO walls(creator_id,slot_count) VALUES($1,$2) RETURNING id',
          [creator, count],
        )
      ).rows[0].id;
      await db.pool.query(
        'INSERT INTO slots(wall_id,position) SELECT $1,n FROM generate_series(0,$2::int-1) n',
        [wall, count],
      );
      const initial = (
        await db.pool.query(
          'SELECT id,position FROM slots WHERE wall_id=$1 ORDER BY position',
          [wall],
        )
      ).rows;
      await db.pool.query(
        "INSERT INTO placements(slot_id,user_id,source) VALUES($1,$2,'admin')",
        [initial[0].id, owner],
      );
      if (kind === 'duplicate-owner') {
        const second = (
          await db.pool.query(
            'INSERT INTO walls(creator_id,slot_count) VALUES($1,10) RETURNING id',
            [creator],
          )
        ).rows[0].id;
        await db.pool.query(
          'INSERT INTO slots(wall_id,position) SELECT $1,n FROM generate_series(0,9) n',
          [second],
        );
      }
      if (kind === 'compatible') {
        await migrate(db.db, { migrationsFolder: folder });
        await migrate(db.db, { migrationsFolder: folder });
        expect(
          (
            await db.pool.query('SELECT owner_user_id FROM walls WHERE id=$1', [
              wall,
            ])
          ).rows[0].owner_user_id,
        ).toBe(owner);
      } else {
        await expect(
          migrate(db.db, { migrationsFolder: folder }),
        ).rejects.toThrow();
        expect(
          (
            await db.pool.query(
              "SELECT 1 FROM information_schema.columns WHERE table_name='walls' AND column_name='owner_user_id'",
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (await db.pool.query('SELECT count(*)::int n FROM walls')).rows[0].n,
        ).toBe(kind === 'duplicate-owner' ? 2 : 1);
      }
      expect(
        (
          await db.pool.query(
            'SELECT id,position FROM slots WHERE wall_id=$1 ORDER BY position',
            [wall],
          )
        ).rows,
      ).toEqual(initial);
      expect(
        (await db.pool.query('SELECT count(*)::int n FROM placements')).rows[0]
          .n,
      ).toBe(1);
    } finally {
      await db.close();
      await control.pool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await control.close();
      await rm(temp, { recursive: true, force: true });
    }
  },
  30000,
);
