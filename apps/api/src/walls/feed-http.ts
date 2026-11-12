import {
  creatorFollowResponse,
  creatorSlugParams,
  wallDiscoveryResponse,
  wallFeedModes,
  wallFeedQuery,
  wallFeedResponse,
  wallIdParams,
} from '@digital-autograph/contracts';
import type { WallFeedRepository } from '@digital-autograph/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticatedSession, requireAuthenticatedUser } from '../auth/http';

const cursorLifetimeMs = 86_400_000;
const cursorSchema = z.strictObject({
  mode: z.enum(wallFeedModes),
  asOf: z.number().int().positive(),
  score: z.number().int().min(0).max(204),
  activityAt: z.iso.datetime(),
  id: z.uuid(),
});

function decodeCursor(cursor: string) {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
  } catch {
    return null;
  }
}

function viewer(request: FastifyRequest) {
  return request.authContext?.kind === 'authenticated'
    ? request.authContext.session.user.id
    : null;
}

function error(reply: FastifyReply, status: number, code: string) {
  return reply.code(status).send({ error: { code } });
}

export function registerWallFeedRoutes(
  app: FastifyInstance,
  repository: WallFeedRepository,
) {
  app.get('/wall-feed', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const query = wallFeedQuery.safeParse(request.query);
    if (!query.success) return error(reply, 400, 'INVALID_REQUEST');
    const { mode, limit, cursor } = query.data;
    const userId = viewer(request);
    if (mode === 'following' && !userId)
      return error(reply, 401, 'UNAUTHORIZED');
    const now = Date.now();
    const after = cursor ? decodeCursor(cursor) : null;
    if (
      cursor &&
      (!after ||
        after.mode !== mode ||
        after.asOf > now ||
        now - after.asOf > cursorLifetimeMs)
    )
      return error(reply, 400, 'INVALID_FEED_CURSOR');
    const asOf = after?.asOf ?? now;
    const rows = await repository.list({
      userId,
      mode,
      limit: limit + 1,
      asOf: new Date(asOf),
      ...(after && {
        after: { ...after, activityAt: new Date(after.activityAt) },
      }),
    });
    const items = rows
      .slice(0, limit)
      .map(
        ({
          id,
          slug,
          displayName,
          title,
          status,
          slotCount,
          occupiedCount,
          activityAt,
          activityKind,
          reason,
        }) => ({
          id,
          creator: { slug, displayName },
          title,
          status,
          slotCount,
          occupiedCount,
          activityAt: activityAt.toISOString(),
          activityKind,
          reason,
        }),
      );
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return wallFeedResponse.parse({
      items,
      nextCursor: last
        ? Buffer.from(
            JSON.stringify({
              mode,
              asOf,
              id: last.id,
              score: last.score,
              activityAt: last.activityAt.toISOString(),
            }),
          ).toString('base64url')
        : null,
    });
  });

  const profilePath = '/creators/:slug/follow';
  app.get(profilePath, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const params = creatorSlugParams.safeParse(request.params);
    if (!params.success) return error(reply, 400, 'INVALID_REQUEST');
    const state = await repository.readFollow(
      viewer(request),
      params.data.slug,
    );
    if (!state) return error(reply, 404, 'CREATOR_NOT_FOUND');
    return creatorFollowResponse.parse({ state });
  });

  const authenticated = { preHandler: requireAuthenticatedUser };
  for (const method of ['PUT', 'DELETE'] as const) {
    const enable = method === 'PUT';
    const options = enable
      ? { ...authenticated, config: { firstUse: true as const } }
      : authenticated;
    app.route({
      method,
      url: profilePath,
      ...options,
      async handler(request, reply) {
        reply.header('Cache-Control', 'private, no-store');
        const params = creatorSlugParams.safeParse(request.params);
        if (!params.success) return error(reply, 400, 'INVALID_REQUEST');
        const state = await repository.setFollow(
          authenticatedSession(request).user.id,
          params.data.slug,
          enable,
        );
        if (!state) return error(reply, 404, 'CREATOR_NOT_FOUND');
        if (state === 'self') return error(reply, 403, 'FORBIDDEN');
        return creatorFollowResponse.parse({ state });
      },
    });

    app.route({
      method,
      url: '/me/walls/:id/discovery',
      ...options,
      async handler(request, reply) {
        reply.header('Cache-Control', 'private, no-store');
        const params = wallIdParams.safeParse(request.params);
        if (!params.success) return error(reply, 400, 'INVALID_REQUEST');
        const result = await repository.setDiscovery(
          authenticatedSession(request).user.id,
          params.data.id,
          enable,
        );
        if (!result) return error(reply, 404, 'WALL_NOT_FOUND');
        return wallDiscoveryResponse.parse(result);
      },
    });
  }

  app.get('/me/walls/:id/discovery', authenticated, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const params = wallIdParams.safeParse(request.params);
    if (!params.success) return error(reply, 400, 'INVALID_REQUEST');
    const result = await repository.discovery(
      authenticatedSession(request).user.id,
      params.data.id,
    );
    if (!result) return error(reply, 404, 'WALL_NOT_FOUND');
    return wallDiscoveryResponse.parse(result);
  });
}
