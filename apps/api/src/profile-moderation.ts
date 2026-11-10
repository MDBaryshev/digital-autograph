import type { FastifyInstance } from 'fastify';
import {
  moderationAutographParams,
  moderationQueueQuery,
  profileModerationDecisionBody,
} from '@digital-autograph/contracts';
import {
  ProfileModerationError,
  type ProfileModerationRepository,
} from '@digital-autograph/db';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';

export function registerProfileModeration(
  app: FastifyInstance,
  repository: ProfileModerationRepository,
  publicationApproved = false,
) {
  app.get(
    '/moderation/profiles',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const parsed = moderationQueueQuery.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
      try {
        return await repository.list(
          authenticatedSession(request).user.id,
          parsed.data.limit,
          parsed.data.cursor,
        );
      } catch (error) {
        if (!(error instanceof ProfileModerationError)) throw error;
        return reply
          .code(error.code === 'FORBIDDEN' ? 403 : 404)
          .send({ error: { code: error.code } });
      }
    },
  );
  app.get(
    '/moderation/profiles/:id/preview',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const parsed = moderationAutographParams.safeParse(request.params);
      if (!parsed.success)
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
      try {
        return await repository.preview(
          authenticatedSession(request).user.id,
          parsed.data.id,
        );
      } catch (error) {
        if (!(error instanceof ProfileModerationError)) throw error;
        return reply
          .code(error.code === 'FORBIDDEN' ? 403 : 404)
          .send({ error: { code: error.code } });
      }
    },
  );
  app.post(
    '/moderation/profiles/:id/decision',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = moderationAutographParams.safeParse(request.params);
      const body = profileModerationDecisionBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
      try {
        return await repository.decide(
          authenticatedSession(request).user.id,
          params.data.id,
          body.data,
          publicationApproved,
        );
      } catch (error) {
        if (!(error instanceof ProfileModerationError)) throw error;
        return reply
          .code(
            error.code === 'FORBIDDEN'
              ? 403
              : error.code === 'SUBMISSION_NOT_FOUND'
                ? 404
                : 409,
          )
          .send({ error: { code: error.code } });
      }
    },
  );
}
