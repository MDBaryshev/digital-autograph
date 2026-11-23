import type { FastifyInstance } from 'fastify';
import type {
  TelegramProfileRepository,
  TelegramProfileSnapshot,
} from '@digital-autograph/db';
import {
  createOpenRouter,
  importProviderAvatar,
  type AiVerdict,
  type TelegramProfileClaims,
} from '@digital-autograph/integrations';

export function captureTelegramProfile(
  repository: Pick<TelegramProfileRepository, 'enqueue'>,
  fetchAvatar = importProviderAvatar,
) {
  return async (userId: string, claims: TelegramProfileClaims) => {
    const observedAt = new Date(
      Math.min(Date.now(), (claims.issuedAt ?? Date.now() / 1000) * 1000),
    );
    const name = claims.name?.trim();
    const username = claims.username?.trim();
    const avatar = claims.picture
      ? await fetchAvatar('telegram', claims.picture)
      : null;
    await repository.enqueue(
      userId,
      {
        name:
          name &&
          Array.from(name).length <= 200 &&
          !name.includes('\u0000') &&
          !/[\uD800-\uDFFF]/u.test(name)
            ? name
            : null,
        username:
          username && /^[A-Za-z0-9_]{1,64}$/.test(username) ? username : null,
        avatarDataUrl: avatar,
      },
      observedAt,
      Boolean(claims.picture && !avatar),
    );
  };
}

export async function screenNextTelegramProfile(
  repository: Pick<TelegramProfileRepository, 'claim' | 'finish'>,
  model: string,
  classify: (profile: TelegramProfileSnapshot) => Promise<AiVerdict>,
) {
  const check = await repository.claim();
  if (!check) return;
  if (check.fallback) {
    await repository.finish(check, { kind: check.fallback, model: null });
    return;
  }
  let verdict: AiVerdict;
  try {
    verdict = await classify(check.profile);
  } catch {
    await repository.finish(check, { kind: 'unavailable', model });
    return;
  }
  if (
    verdict.decision === 'rejected' &&
    verdict.reasonCode &&
    verdict.reasonCode !== 'NOT_AN_AUTOGRAPH'
  ) {
    await repository.finish(check, {
      kind: 'flagged',
      reason: verdict.reasonCode,
      model,
    });
  } else if (verdict.decision === 'approved' && verdict.confidence >= 0.95) {
    await repository.finish(check, { kind: 'clear', model });
  } else {
    await repository.finish(check, { kind: 'uncertain', model });
  }
}

export function registerTelegramProfileScreening(
  app: FastifyInstance,
  repository: TelegramProfileRepository,
  config: { key: string; model: string },
) {
  const provider = createOpenRouter(config.key);
  let running: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (running) return;
    running = screenNextTelegramProfile(repository, config.model, (profile) =>
      provider.moderateTelegramProfile(config.model, profile),
    )
      .catch(() => {
        app.log.warn(
          { event: 'TELEGRAM_PROFILE_SCREENING_FAILED' },
          'Telegram profile screening is temporarily unavailable',
        );
      })
      .finally(() => {
        running = null;
      });
  }, 2000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await running;
  });
}
