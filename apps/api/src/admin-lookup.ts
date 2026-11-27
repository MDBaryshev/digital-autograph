import type { FastifyInstance } from 'fastify';
import {
  adminLookupQuery,
  adminLookupResponse,
} from '@digital-autograph/contracts';
import {
  AdminLookupForbidden,
  type AdminLookupRepository,
} from '@digital-autograph/db';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';

export function registerAdminLookup(
  app: FastifyInstance,
  repository: AdminLookupRepository,
) {
  app.get(
    '/admin/lookup',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const query = adminLookupQuery.safeParse(request.query);
      if (!query.success)
        return reply.code(400).send({ error: { code: 'INVALID_LOOKUP' } });
      try {
        const result = await repository.lookup(
          authenticatedSession(request).user.id,
          query.data.id,
        );
        // Explicit output schema: this route must never serialize full DB rows.
        return adminLookupResponse.parse(result);
      } catch (error) {
        if (error instanceof AdminLookupForbidden)
          return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
        throw error;
      }
    },
  );
}
