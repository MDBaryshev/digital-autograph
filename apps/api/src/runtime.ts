import {
  createPgAppearanceRepository,
  createPgWallDesignRepository,
} from '@digital-autograph/db';
import { importProviderAvatar } from '@digital-autograph/integrations';
import { registerAppearance } from './appearance';
import { registerWallDesignRoutes } from './walls/design-http';
import { registerCommunityCubeRoutes } from './community-cube';
import { registerAiAutographs } from './ai-autographs';
import { registerAccountWorkspace } from './account-workspace';
import { loadApiStartupConfig } from './startup-config';
import type { LegalHttp } from './legal-http';
import {
  loadLegalDocuments,
  loadSecurityDocuments,
} from '@digital-autograph/config';
import {
  createPgAgeDeclarationRepository,
  createPgAccountWorkspaceRepository,
  createPgLegalRepository,
} from '@digital-autograph/db';
import {
  PaymentService,
  type PaymentProvider,
  type PaymentSettings,
} from '@digital-autograph/payments';
import { createPgPaymentRepository } from '@digital-autograph/db';
import { createYookassaProvider } from '@digital-autograph/integrations';
import {
  EmailAuthService,
  IdentityService,
  OAuthAttemptService,
  SessionService,
} from '@digital-autograph/auth';
import {
  createDatabase,
  createPgEmailAuthRepository,
  createPgOAuthAttemptRepository,
  createPgProviderIdentityRepository,
  createPgSessionRepository,
  createPgWallRepository,
  createPgPlacementHistoryRepository,
  createPgFreeClaimRepository,
  createPgPublicPlacementMediaRepository,
  createPgPricingRepository,
  createPgTakeoverReservationRepository,
  createPgAutographRepository,
  createPgAutographModerationRepository,
  createPgCommunityCubeRepository,
} from '@digital-autograph/db';
import {
  AutographService,
  ModerationService,
} from '@digital-autograph/autographs';
import {
  FreeClaimService,
  PlacementHistoryService,
  PublicPlacementMediaService,
  WallService,
  TakeoverQuoteService,
  TakeoverReservationService,
} from '@digital-autograph/walls';
import {
  createYandexOAuthClient,
  createVkIdOAuthClient,
  createAuthEmailSender,
  createPrivateS3Storage,
} from '@digital-autograph/integrations';
import { buildApi } from './app';
import {
  TelegramLinkService,
  registerTelegramLinkRoutes,
} from './auth/telegram-link';
import { createPgTelegramLinkRepository } from '@digital-autograph/db';
import { createTelegramOidcClient } from '@digital-autograph/integrations';

import { YandexLoginService } from './auth/yandex-login';
import { VkIdLoginService } from './auth/vk-id-login';
import { NotificationService } from '@digital-autograph/notifications';
import {
  createPgNotificationRepository,
  createPgShareRepository,
} from '@digital-autograph/db';

export async function startApi(
  legalDocuments: LegalHttp['documents'] = loadLegalDocuments(),
  syntheticPayment?: { provider: PaymentProvider; settings: PaymentSettings },
): Promise<void> {
  const {
    config,
    emailConfig,
    telegramLinkConfig,
    paymentConfig,
    yandexConfig,
    vkIdConfig,
    notificationTelegram,
    enableTestAuthSeam,
    openRouter,
  } = loadApiStartupConfig(legalDocuments);
  if (
    syntheticPayment &&
    (config.APP_ENV !== 'test' || process.env.NODE_ENV === 'production')
  )
    throw new Error(
      'Synthetic payment composition requires isolated test runtime',
    );
  const database = createDatabase(config.DATABASE_URL);
  const storage = createPrivateS3Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  if (['local', 'test', 'development'].includes(config.APP_ENV)) {
    await storage.bootstrapLocalBucket();
  }
  const sessions = new SessionService(
    createPgSessionRepository(database.pool),
    config.SESSION_TTL_SECONDS,
  );
  const attempts = new OAuthAttemptService(
    createPgOAuthAttemptRepository(database.pool),
    600,
  );
  const identities = new IdentityService(
    createPgProviderIdentityRepository(database.pool),
  );
  const appearance = createPgAppearanceRepository(database.pool);
  const storeAvatar = async (
    provider: string,
    userId: string,
    picture: string,
  ) => {
    if (!config.CREATOR_PROFILE_PUBLICATION_APPROVED) return;
    const image = await importProviderAvatar(provider, picture);
    if (image) await appearance.saveProviderAvatar(userId, image);
  };
  const payments =
    paymentConfig || syntheticPayment
      ? new PaymentService(
          createPgPaymentRepository(database.pool, { legalDocuments }),
          syntheticPayment?.provider ??
            createYookassaProvider({
              shopId: paymentConfig!.YOOKASSA_SHOP_ID,
              secretKey: paymentConfig!.YOOKASSA_SECRET_KEY,
            }),
          syntheticPayment?.settings ?? {
            shopId: paymentConfig!.YOOKASSA_SHOP_ID,
            mode: paymentConfig!.PAYMENT_MODE,
            returnUrl: paymentConfig!.PAYMENT_RETURN_URL,
            creatorShareBps: paymentConfig!.PAYMENT_CREATOR_SHARE_BPS,
          },
          (signal) => console.warn(JSON.stringify(signal)),
        )
      : undefined;
  const app = buildApi(
    database,
    sessions,
    {
      appEnvironment: config.APP_ENV,
      sessionTtlSeconds: config.SESSION_TTL_SECONDS,
      trustedWebOrigins: config.TRUSTED_WEB_ORIGINS,
      firstUseEnforced: config.FIRST_USE_ENFORCEMENT_ENABLED,
    },
    new WallService(createPgWallRepository(database.pool)),
    new AutographService(
      createPgAutographRepository(database.pool),
      storage,
      config.UPLOAD_URL_TTL_SECONDS,
      undefined,
      config.PREVIEW_URL_TTL_SECONDS,
    ),
    new ModerationService(
      createPgAutographModerationRepository(database.pool),
      storage,
      config.PREVIEW_URL_TTL_SECONDS,
    ),
    new FreeClaimService(createPgFreeClaimRepository(database.pool)),
    new PublicPlacementMediaService(
      createPgPublicPlacementMediaRepository(database.pool),
      storage,
    ),
    new TakeoverQuoteService(createPgPricingRepository(database.pool)),
    new TakeoverReservationService(
      createPgTakeoverReservationRepository(database.pool),
    ),
    enableTestAuthSeam
      ? {
          sessions,
          userId: process.env.E2E_AUTH_USER_ID ?? '',
          webOrigin: config.WEB_ORIGIN,
        }
      : undefined,
    new PlacementHistoryService(
      createPgPlacementHistoryRepository(database.pool),
    ),
    payments,
    {
      service: new NotificationService(
        createPgNotificationRepository(database.pool),
      ),
      shares: createPgShareRepository(database.pool),
      telegram: notificationTelegram
        ? {
            username: notificationTelegram.NOTIFICATION_TELEGRAM_BOT_USERNAME,
            secret: notificationTelegram.NOTIFICATION_TELEGRAM_WEBHOOK_SECRET,
          }
        : undefined,
    },
    {
      disableNewPayments: config.DISABLE_NEW_PAYMENTS,
      disableFreeClaims: config.DISABLE_FREE_CLAIMS,
    },
    {
      repository: createPgLegalRepository(database.pool),
      ageDeclarations: createPgAgeDeclarationRepository(database.pool),
      documents: legalDocuments,
      securityDocuments: loadSecurityDocuments(),
    },
    yandexConfig
      ? {
          login: new YandexLoginService(
            attempts,
            createYandexOAuthClient({
              ...yandexConfig,
              includeProfile: config.CREATOR_PROFILE_PUBLICATION_APPROVED,
            }),
            identities,
            sessions,
            (userId, picture) => storeAvatar('yandex', userId, picture),
          ),
          config: {
            appEnvironment: config.APP_ENV,
            webOrigin: config.WEB_ORIGIN,
            redirectUri: yandexConfig.redirectUri,
          },
        }
      : undefined,
    vkIdConfig
      ? {
          login: new VkIdLoginService(
            attempts,
            createVkIdOAuthClient({
              ...vkIdConfig,
              includeProfile: config.CREATOR_PROFILE_PUBLICATION_APPROVED,
            }),
            identities,
            sessions,
            (userId, picture) => storeAvatar('vk_id', userId, picture),
          ),
          config: {
            appEnvironment: config.APP_ENV,
            webOrigin: config.WEB_ORIGIN,
            redirectUri: vkIdConfig.redirectUri,
          },
        }
      : undefined,
    undefined,
    emailConfig
      ? new EmailAuthService(
          createPgEmailAuthRepository(database.pool),
          createAuthEmailSender(emailConfig),
          config.SESSION_TTL_SECONDS,
        )
      : undefined,
  );
  if (telegramLinkConfig)
    registerTelegramLinkRoutes(
      app,
      new TelegramLinkService(
        attempts,
        createTelegramOidcClient(telegramLinkConfig),
        createPgTelegramLinkRepository(database.pool),
      ),
      { appEnvironment: config.APP_ENV, webOrigin: config.WEB_ORIGIN },
    );
  registerAccountWorkspace(
    app,
    createPgAccountWorkspaceRepository(database.pool),
    config.CREATOR_PROFILE_PUBLICATION_APPROVED,
  );
  registerAppearance(
    app,
    appearance,
    config.CREATOR_PROFILE_PUBLICATION_APPROVED,
  );
  registerAiAutographs(app, database.pool, storage, openRouter);
  registerWallDesignRoutes(
    app,
    createPgWallDesignRepository(database.pool),
    config.CREATOR_PROFILE_PUBLICATION_APPROVED,
  );
  registerCommunityCubeRoutes(
    app,
    createPgCommunityCubeRepository(database.pool),
    storage,
    config.COMMUNITY_CUBE_PUBLICATION_ENABLED,
  );
  let closing = false;

  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    try {
      await app.close();
      await database.close();
      storage.close();
    } catch (error) {
      app.log.error(
        { err: error, event: 'API_SHUTDOWN_FAILED' },
        'API shutdown failed',
      );
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
  } catch (error) {
    app.log.error(
      { err: error, event: 'API_STARTUP_FAILED' },
      'API startup failed',
    );
    await shutdown();
    process.exitCode = 1;
  }
}
