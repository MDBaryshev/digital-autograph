import { acceptedSession } from '../tests/integration/first-use-fixtures';
import { test as base, expect, type BrowserContext } from '@playwright/test';
import { SessionService } from '../packages/auth/src/index';
import {
  createDatabase,
  createPgSessionRepository,
} from '../packages/db/src/index';
import {
  creators,
  creatorProfiles,
  users,
  walls,
} from '../packages/db/src/schema';
import { createPrivateS3Storage } from '../packages/integrations/src/private-s3';
import {
  creatorFixture,
  slotFixture,
  userFixture,
  wallFixture,
} from '../tests/integration/fixtures';
import { isolatedE2EEnvironment } from './environment';

export const e2eUserId = 'f1111111-1111-4111-8111-111111111111';
export const e2eCreatorId = creatorFixture(1).id!;
export const e2eWallId = wallFixture(e2eCreatorId, 1).id!;
export const e2eSlotId = slotFixture(e2eWallId, 1).id!;
const ownerId = userFixture(2).id!;

type Scenario = {
  database: ReturnType<typeof createDatabase>;
  actorContext(userId: string): Promise<BrowserContext>;
  ownerId: string;
};

export const test = base.extend<{ scenario: Scenario; uiLocale: 'en' | 'ru' }>({
  uiLocale: ['en', { option: true }],
  context: async ({ context, uiLocale }, use) => {
    await context.addCookies([
      {
        name: 'destka-locale',
        value: uiLocale,
        url: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
      },
    ]);
    await use(context);
  },
  scenario: [
    async ({ browser, uiLocale }, use) => {
      const config = isolatedE2EEnvironment();
      const database = createDatabase(config.databaseUrl);
      const storage = createPrivateS3Storage(config.storage);
      const contexts: BrowserContext[] = [];
      const cleanup = async () => {
        const assets = await database.pool.query<{ storage_key: string }>(
          'SELECT storage_key FROM autograph_assets',
        );
        for (const asset of assets.rows)
          await storage.deleteObject(asset.storage_key);
        // The live E2E worker can deadlock with the cascade. PostgreSQL rolls
        // back the standalone statement, so only retry the database reset.
        for (let attempt = 1; ; attempt += 1) {
          try {
            await database.pool.query('TRUNCATE TABLE users CASCADE');
            return;
          } catch (error) {
            if (
              attempt === 3 ||
              !(error instanceof Error) ||
              !('code' in error) ||
              error.code !== '40P01'
            ) {
              throw error;
            }
          }
        }
      };
      try {
        await cleanup();
        await database.db
          .insert(users)
          .values([{ ...userFixture(1), id: e2eUserId }, userFixture(2)]);
        await database.pool.query(
          "INSERT INTO user_roles (user_id, role) VALUES ($1, 'moderator')",
          [ownerId],
        );
        await database.db.insert(creators).values(creatorFixture(1, ownerId));
        await database.db.insert(creatorProfiles).values({
          creatorId: e2eCreatorId,
          slug: 'e2e-creator',
          displayName: 'E2E Creator',
        });
        await database.db
          .insert(walls)
          .values({ ...wallFixture(e2eCreatorId, 1), status: 'live' });
        await database.pool.query(
          'UPDATE slots SET id=$1 WHERE wall_id=$2 AND position=0',
          [e2eSlotId, e2eWallId],
        );
        const sessions = new SessionService(
          createPgSessionRepository(database.pool),
          1209600,
        );
        await use({
          database,
          ownerId,
          async actorContext(userId) {
            const issued = await acceptedSession(sessions, database, userId);
            const context = await browser.newContext();
            contexts.push(context);
            await context.addCookies([
              {
                name: 'destka-locale',
                value: uiLocale,
                url: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
              },
              {
                name: 'da_session',
                value: issued.token,
                url: process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000',
                httpOnly: true,
                sameSite: 'Lax',
              },
            ]);
            return context;
          },
        });
      } finally {
        try {
          for (const context of contexts) await context.close();
          await cleanup();
        } finally {
          await database.close();
          storage.close();
        }
      }
    },
    { auto: true },
  ],
});
export { expect };
