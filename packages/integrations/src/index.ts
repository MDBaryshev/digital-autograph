export { createPrivateS3Storage, type PrivateS3Config } from './private-s3';

export {
  createTelegramOidcClient,
  type TelegramOidcClient,
  type TelegramOidcConfig,
} from './telegram';
export { createYookassaProvider } from './yookassa';
export { createTelegramNotificationSender } from './telegram-notifications';
export {
  buildTelegramWallWidgetSend,
  buildTelegramWallWidgetUpdate,
} from './telegram-wall-widget';
export { createTelegramTestWallWidgetClient } from './telegram-wall-widget-client';

export {
  createYandexOAuthClient,
  type YandexOAuthClient,
  type YandexOAuthConfig,
} from './yandex';

export {
  createVkIdOAuthClient,
  type VkIdOAuthClient,
  type VkIdOAuthConfig,
} from './vk-id';

export { createOpenRouter, type AiVerdict } from './openrouter';

export {
  autographModerationPolicy,
  autographModerationMinConfidence,
} from './autograph-moderation';

export {
  normalizeAppearanceImage,
  importProviderAvatar,
} from './appearance-images';

export { createAuthEmailSender } from './auth-email';
