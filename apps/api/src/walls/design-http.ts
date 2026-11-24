import {
  createWallDesignTemplateBody,
  previewWallDesignTemplateBody,
  saveWallDesignBody,
  wallIdParams,
} from '@digital-autograph/contracts';
import {
  WallDesignError,
  type WallDesignRepository,
} from '@digital-autograph/db';
import type { WallDesign } from '@digital-autograph/domain';
import { normalizeAppearanceImage } from '@digital-autograph/integrations';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticatedSession, requireAuthenticatedUser } from '../auth/http';

const auth = { preHandler: requireAuthenticatedUser };
const mutation = { ...auth, config: { firstUse: true as const } };

function failure(reply: FastifyReply, status: number, code: string) {
  return reply.code(status).send({ error: { code } });
}

function sendDesignError(error: unknown, reply: FastifyReply) {
  if (error instanceof WallDesignError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'DESIGN_CHANGED'
          ? 409
          : 404;
    return failure(reply, status, error.code);
  }
  if (error instanceof Error && error.message === 'INVALID_APPEARANCE_IMAGE') {
    return failure(reply, 400, error.message);
  }
  throw error;
}

export function registerWallDesignRoutes(
  app: FastifyInstance,
  repository: WallDesignRepository,
  publicationApproved: boolean,
) {
  let activeImages = 0;
  async function withImages(
    input: WallDesign,
    reply: FastifyReply,
    action: (design: WallDesign) => Promise<unknown>,
    prior?: WallDesign,
  ) {
    if (activeImages >= 2) return failure(reply, 429, 'APPEARANCE_BUSY');
    activeImages++;
    try {
      return await action({
        ...input,
        avatarDataUrl:
          input.avatarDataUrl && input.avatarDataUrl !== prior?.avatarDataUrl
            ? await normalizeAppearanceImage(input.avatarDataUrl, 'avatar')
            : input.avatarDataUrl,
        coverDataUrl:
          input.coverDataUrl && input.coverDataUrl !== prior?.coverDataUrl
            ? await normalizeAppearanceImage(input.coverDataUrl, 'wall-cover')
            : input.coverDataUrl,
      });
    } finally {
      activeImages--;
    }
  }

  app.get('/me/walls/:id/design', auth, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const params = wallIdParams.safeParse(request.params);
    if (!params.success) return failure(reply, 400, 'INVALID_REQUEST');
    try {
      return {
        ...(await repository.read(
          authenticatedSession(request).user.id,
          params.data.id,
        )),
        editable: publicationApproved,
      };
    } catch (error) {
      return sendDesignError(error, reply);
    }
  });

  app.put('/me/walls/:id/design', mutation, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!publicationApproved)
      return failure(reply, 409, 'PROFILE_PUBLICATION_UNAVAILABLE');
    const params = wallIdParams.safeParse(request.params);
    const body = saveWallDesignBody.safeParse(request.body);
    if (!params.success || !body.success)
      return failure(reply, 400, 'INVALID_APPEARANCE');
    const userId = authenticatedSession(request).user.id;
    const wallId = params.data.id;
    try {
      const current = await repository.read(userId, wallId);
      if (current.revision !== body.data.revision)
        return failure(reply, 409, 'DESIGN_CHANGED');
      return await withImages(
        body.data.design,
        reply,
        (design) =>
          repository.save(userId, wallId, {
            design,
            revision: body.data.revision,
          }),
        current.design,
      );
    } catch (error) {
      return sendDesignError(error, reply);
    }
  });

  app.post(
    '/me/walls/:id/design/import-preview',
    auth,
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = wallIdParams.safeParse(request.params);
      const body = previewWallDesignTemplateBody.safeParse(request.body);
      if (!params.success || !body.success)
        return failure(reply, 400, 'INVALID_REQUEST');
      try {
        return {
          design: await repository.previewTemplate(
            authenticatedSession(request).user.id,
            params.data.id,
            body.data.token,
          ),
        };
      } catch (error) {
        return sendDesignError(error, reply);
      }
    },
  );

  app.post('/admin/wall-design-templates', auth, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const adminId = authenticatedSession(request).user.id;
    if (!(await repository.isAdmin(adminId)))
      return failure(reply, 403, 'FORBIDDEN');
    const body = createWallDesignTemplateBody.safeParse(request.body);
    if (!body.success) return failure(reply, 400, 'INVALID_APPEARANCE');
    try {
      return await withImages(body.data.design, reply, async (design) => {
        const template = await repository.createTemplate(
          adminId,
          body.data.author,
          design,
        );
        return reply.code(201).send(template);
      });
    } catch (error) {
      return sendDesignError(error, reply);
    }
  });
}
