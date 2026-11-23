import type { FastifyInstance } from 'fastify';
import {
  AccountWorkspaceError,
  type AccountWorkspaceRepository,
} from '@digital-autograph/db';
import { accountProfileBody } from '@digital-autograph/contracts';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';
export function registerAccountWorkspace(
  app: FastifyInstance,
  repository: AccountWorkspaceRepository,
  profilePublicationApproved = false,
) {
  app.get(
    '/me/workspace',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        ...(await repository.read(authenticatedSession(request).user.id)),
        canEditProfile: profilePublicationApproved,
      };
    },
  );
  app.put(
    '/me/profile',
    { preHandler: requireAuthenticatedUser, config: { firstUse: true } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      // A successful sign-in/Terms acceptance does not authorize a new public-profile writer.
      if (!profilePublicationApproved)
        return reply
          .code(409)
          .send({ error: { code: 'PROFILE_PUBLICATION_UNAVAILABLE' } });
      const body = accountProfileBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: { code: 'INVALID_PROFILE' } });
      try {
        return await repository.saveProfile(
          authenticatedSession(request).user.id,
          body.data,
        );
      } catch (error) {
        if (error instanceof AccountWorkspaceError)
          return reply
            .code(
              error.code === 'FORBIDDEN'
                ? 403
                : error.code === 'SUBMISSION_LIMIT'
                  ? 429
                  : 409,
            )
            .send({ error: { code: error.code } });
        throw error;
      }
    },
  );
}
