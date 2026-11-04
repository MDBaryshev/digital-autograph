import type { FastifyInstance } from 'fastify';
import type { AppearanceRepository } from '@digital-autograph/db';
import { normalizeAppearanceImage } from '@digital-autograph/integrations';
import { z } from 'zod';
import { authenticatedSession, requireAuthenticatedUser } from './auth/http';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) =>
      Array.from(s).every((c) => {
        const n = c.codePointAt(0)!;
        return (n >= 32 || n === 10 || n === 9) && (n < 0xd800 || n > 0xdfff);
      }),
    );
const body = z.strictObject({
  title: text(100),
  description: text(500),
  avatarSource: z.enum(['provider', 'upload', 'none']),
  avatarDataUrl: z.string().max(350000).nullable(),
  coverDataUrl: z.string().max(350000).nullable(),
});
export function registerAppearance(
  app: FastifyInstance,
  repo: AppearanceRepository,
  publicationApproved = false,
) {
  let processing = 0;
  app.get(
    '/me/appearance',
    { preHandler: requireAuthenticatedUser },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return repo.read(authenticatedSession(request).user.id);
    },
  );
  app.put(
    '/me/appearance',
    { preHandler: requireAuthenticatedUser, config: { firstUse: true } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!publicationApproved)
        return reply
          .code(409)
          .send({ error: { code: 'PROFILE_PUBLICATION_UNAVAILABLE' } });
      const parsed = body.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: { code: 'INVALID_APPEARANCE' } });
      if (processing >= 2)
        return reply.code(429).send({ error: { code: 'APPEARANCE_BUSY' } });
      processing++;
      try {
        const p = parsed.data;
        if (p.avatarSource === 'upload' && !p.avatarDataUrl)
          throw Error('INVALID_APPEARANCE_IMAGE');
        const avatarDataUrl =
          p.avatarSource === 'upload'
            ? await normalizeAppearanceImage(p.avatarDataUrl!, 'avatar')
            : null;
        const coverDataUrl = p.coverDataUrl
          ? await normalizeAppearanceImage(p.coverDataUrl, 'cover')
          : null;
        await repo.save(
          authenticatedSession(request).user.id,
          {
            title: p.title,
            description: p.description,
            avatarDataUrl,
            coverDataUrl,
          },
          p.avatarSource,
        );
        return { saved: true };
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_APPEARANCE_IMAGE')
          return reply
            .code(400)
            .send({ error: { code: 'INVALID_APPEARANCE_IMAGE' } });
        if (e instanceof Error && e.message === 'FORBIDDEN')
          return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
        throw e;
      } finally {
        processing--;
      }
    },
  );
}
