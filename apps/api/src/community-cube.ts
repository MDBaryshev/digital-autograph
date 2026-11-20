import {
  CommunityCubeError,
  type CommunityCubeRepository,
} from '@digital-autograph/db';
import {
  communityCubeMaxCell,
  communityCubeMaxGeneration,
} from '@digital-autograph/domain';
import {
  PublicPlacementMediaError,
  PublicPlacementMediaService,
} from '@digital-autograph/walls';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';

const placementBody = z.strictObject({
  autographId: z.uuid().transform((id) => id.toLowerCase()),
  requestId: z.uuid(),
  generation: z.number().int().min(1).max(communityCubeMaxGeneration),
  cell: z.number().int().min(1).max(communityCubeMaxCell),
});
const cellParams = z.object({ cell: z.string().regex(/^[1-9][0-9]{0,3}$/) });
const placementParams = z.object({ id: z.uuid() });

export function registerCommunityCubeRoutes(
  app: FastifyInstance,
  repository: CommunityCubeRepository,
  storage: ConstructorParameters<typeof PublicPlacementMediaService>[1],
  publicationEnabled: boolean,
) {
  // Owners keep the ability to inspect and withdraw their marks during a pause.
  app.get(
    '/me/community-cube',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        placement: await repository.getOwn(
          authenticatedSession(request).user.id,
        ),
      };
    },
  );
  app.delete(
    '/me/community-cube/:id',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = placementParams.safeParse(request.params);
      if (!params.success) {
        return reply
          .code(404)
          .send({ error: { code: 'CUBE_PLACEMENT_NOT_FOUND' } });
      }
      const withdrawn = await repository.withdraw(
        authenticatedSession(request).user.id,
        params.data.id,
      );
      if (!withdrawn) {
        return reply
          .code(404)
          .send({ error: { code: 'CUBE_PLACEMENT_NOT_FOUND' } });
      }
      return reply.code(204).send();
    },
  );

  if (!publicationEnabled) return;

  app.get('/community-cube', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return repository.snapshot();
  });
  app.get('/community-cube/cells/:cell/media', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const params = cellParams.safeParse(request.params);
    if (!params.success) return reply.code(404).send();
    const cell = Number(params.data.cell);
    if (cell > communityCubeMaxCell) return reply.code(404).send();

    const resolution = await repository.resolveMedia(cell);
    if (!resolution) return reply.code(404).send();
    const media = new PublicPlacementMediaService(
      { resolveActive: async () => ({ kind: 'available', ...resolution }) },
      storage,
    );
    try {
      const bytes = await media.getActivePng(resolution.placementId);
      // Storage I/O runs outside database locks. Recheck in case the mark was
      // withdrawn or replaced while the bytes were being read.
      const active = await repository.resolveMedia(cell);
      if (active?.placementId !== resolution.placementId) {
        return reply.code(404).send();
      }
      return reply
        .header('Content-Type', 'image/png')
        .header('Content-Disposition', 'inline')
        .send(bytes);
    } catch (error) {
      if (!(error instanceof PublicPlacementMediaError)) throw error;
      app.log.warn(
        { cell, reason: error.reason },
        'Community cube media unavailable',
      );
      return reply.code(404).send();
    }
  });

  app.post(
    '/me/community-cube',
    {
      config: { firstUse: true },
      preHandler: requireAuthenticatedUser,
      bodyLimit: 1024,
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const body = placementBody.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
      }
      try {
        const { placement, created } = await repository.place({
          ...body.data,
          userId: authenticatedSession(request).user.id,
        });
        return reply.code(created ? 201 : 200).send({ placement });
      } catch (error) {
        if (!(error instanceof CommunityCubeError)) throw error;
        return reply
          .code(error.code === 'AUTOGRAPH_NOT_AVAILABLE' ? 404 : 409)
          .send({ error: { code: error.code } });
      }
    },
  );
}
