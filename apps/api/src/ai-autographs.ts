import type { FastifyInstance } from 'fastify';
import type { Database } from '@digital-autograph/db';
import { z } from 'zod';
import {
  createPgAiAutographRepository,
  AiAdmissionError,
  aiFingerprint,
  createPgAutographModerationRepository,
} from '@digital-autograph/db';
import { createOpenRouter } from '@digital-autograph/integrations';
import type { loadOpenRouterConfig } from '@digital-autograph/config';
import type { PrivateOriginalStorage } from '@digital-autograph/autographs';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';

const generationBody = z.strictObject({
  requestId: z.uuid(),
  nickname: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (s) =>
        Array.from(s).every(
          (c) => c.codePointAt(0)! >= 32 && c.codePointAt(0)! !== 127,
        ) && !/[\uD800-\uDFFF]/u.test(s),
    ),
});
type Config = ReturnType<typeof loadOpenRouterConfig>;
export function registerAiAutographs(
  app: FastifyInstance,
  pool: Database['pool'],
  storage: PrivateOriginalStorage,
  config: Config,
) {
  const repo = createPgAiAutographRepository(pool);
  const tasks = new Set<Promise<unknown>>();
  const provider = config ? createOpenRouter(config.key) : null;
  app.get('/ai/autographs/capabilities', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      generation: !!config?.generationModel,
      moderation: !!config?.moderationModel,
    };
  });
  app.post(
    '/ai/autographs/suggestions',
    { preHandler: requireAuthenticatedUser, config: { firstUse: true } },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!config?.generationModel || !provider)
        return reply.code(503).send({ error: { code: 'AI_UNAVAILABLE' } });
      const body = generationBody.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send({ error: { code: 'INVALID_AI_REQUEST' } });
      const userId = authenticatedSession(req).user.id;
      const { requestId, nickname } = body.data;
      try {
        const admission = await repo.claim(
          userId,
          requestId,
          'generation',
          aiFingerprint(nickname),
          config.generationModel,
        );
        if (admission.fresh) {
          const task = provider
            .generate(config.generationModel, nickname)
            .then((images) => repo.finish(userId, requestId, { images }))
            .catch(() =>
              repo.finish(
                userId,
                requestId,
                { error: 'AI_GENERATION_FAILED' },
                true,
              ),
            )
            .catch(() => {
              app.log.warn(
                { event: 'AI_GENERATION_RECORD_FAILED' },
                'AI result requires operator review',
              );
            });
          tasks.add(task);
          void task.finally(() => tasks.delete(task));
        }
        return reply.code(202).send({ requestId });
      } catch (e) {
        if (e instanceof AiAdmissionError)
          return reply
            .code(e.message === 'AI_QUOTA_EXCEEDED' ? 429 : 409)
            .send({ error: { code: e.message } });
        throw e;
      }
    },
  );
  app.get(
    '/ai/autographs/suggestions/:id',
    { preHandler: requireAuthenticatedUser },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const id = z.uuid().safeParse((req.params as { id: string }).id);
      if (!id.success)
        return reply.code(400).send({ error: { code: 'INVALID_AI_REQUEST' } });
      const row = await repo.read(authenticatedSession(req).user.id, id.data);
      if (!row)
        return reply
          .code(404)
          .send({ error: { code: 'AI_REQUEST_NOT_FOUND' } });
      if (row.created_at.getTime() < Date.now() - 3600000)
        return reply.code(410).send({ error: { code: 'AI_RESULT_EXPIRED' } });
      return {
        state: row.state,
        ...(row.state === 'completed' ? row.result : {}),
      };
    },
  );

  // Reuse ordinary moderation evidence/role checks, never grant a role at startup.
  const moderation = createPgAutographModerationRepository(pool);
  let running: Promise<void> | null = null;
  let closing = false;
  const cycle = async () => {
    await repo.expireImages();
    if (!config?.moderationModel || !config.moderatorId || !provider) return;
    // Checks role and active account before any image disclosure or provider cost.
    await moderation.list(config.moderatorId, 1);
    const [item] = await repo.candidates();
    if (!item) return;
    const operation = 'moderation:' + item.cleaned_asset_id;
    const admission = await repo.claim(
      config.moderatorId,
      operation,
      'moderation',
      aiFingerprint(item.cleaned_asset_id),
      config.moderationModel,
    );
    if (!admission.fresh) return;
    try {
      const target = await moderation.previewTarget(
        config.moderatorId,
        item.id,
      );
      const bytes = await storage.getPrivateObject(target.key, 2 * 1024 * 1024);
      const verdict = await provider.moderate(config.moderationModel, bytes);
      // Model, asset identity and parsed verdict are durably recorded before a decision.
      await repo.finish(config.moderatorId, operation, {
        ...verdict,
        autographId: item.id,
        cleanedAssetId: item.cleaned_asset_id,
        policy: 'autograph-v1',
      });
      if (closing || verdict.decision === 'manual' || verdict.confidence < 0.95)
        return;
      await moderation.decide(
        config.moderatorId,
        item.id,
        verdict.decision === 'approved'
          ? { decision: 'approved' }
          : { decision: 'rejected', reasonCode: verdict.reasonCode! },
      );
    } catch {
      // Unknown outcome is never an approval and is never automatically billed again.
      await repo
        .finish(
          config.moderatorId,
          operation,
          { error: 'AI_MANUAL_REVIEW_REQUIRED' },
          true,
        )
        .catch(() => {});
      app.log.warn(
        { event: 'AI_MODERATION_MANUAL_REVIEW' },
        'Autograph remains subject to ordinary moderation',
      );
    }
  };
  const timer = config
    ? setInterval(() => {
        if (running || closing) return;
        running = cycle()
          .catch(() => {
            app.log.warn(
              { event: 'AI_CYCLE_UNAVAILABLE' },
              'AI cycle unavailable',
            );
          })
          .finally(() => {
            running = null;
          });
      }, 10000)
    : null;
  timer?.unref();
  app.addHook('onClose', async () => {
    closing = true;
    if (timer) clearInterval(timer);
    await running;
    await Promise.allSettled([...tasks]);
  });
}
