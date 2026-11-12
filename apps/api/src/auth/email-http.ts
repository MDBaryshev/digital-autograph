import {
  PasswordBusyError,
  validNewPassword,
  type EmailAuthService,
} from '@digital-autograph/auth';
import { emailConfirmationReturnPath } from '@digital-autograph/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setSessionCookie, type AuthHttpConfig } from './http';

const email = z
  .string()
  .max(254)
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .refine((v) => /^[\x21-\x7e]+$/.test(v));
const emailBody = z
  .object({ email, returnTo: z.string().max(512).optional() })
  .strict();
const loginBody = z.object({ email, password: z.string().max(512) }).strict();
const completeBody = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: z.string().max(512).refine(validNewPassword),
  })
  .strict();

export function registerEmailAuthRoutes(
  app: FastifyInstance,
  service: EmailAuthService,
  config: AuthHttpConfig,
) {
  const deliveries = new Set<Promise<void>>();
  app.addHook('onClose', async () => {
    await Promise.all(deliveries);
  });
  for (const operation of ['register', 'reset', 'login', 'confirm'] as const) {
    app.post(
      `/auth/email/${operation}`,
      { bodyLimit: 4096 },
      async (request, reply) => {
        // Login CSRF needs an Origin check even before a session exists.
        if (
          !request.headers.origin ||
          !config.trustedWebOrigins.includes(request.headers.origin)
        )
          return reply.code(403).send({ error: { code: 'INVALID_ORIGIN' } });
        if (
          operation === 'login' &&
          request.authContext?.kind === 'authenticated'
        )
          return reply
            .code(409)
            .send({ error: { code: 'ALREADY_AUTHENTICATED' } });
        const parsed = (
          operation === 'confirm'
            ? completeBody
            : operation === 'login'
              ? loginBody
              : emailBody
        ).safeParse(request.body);
        if (!parsed.success)
          return reply
            .code(400)
            .send({ error: { code: 'INVALID_AUTH_INPUT' } });
        const body = parsed.data;
        if (
          !(await service.allow(
            operation,
            'email' in body ? body.email : undefined,
          ))
        )
          return reply
            .header('Retry-After', '900')
            .code(429)
            .send({ error: { code: 'AUTH_RATE_LIMITED' } });
        try {
          if (operation === 'register' || operation === 'reset') {
            // Return before delivery so provider timing cannot disclose account existence.
            // Bound background deliveries and drain them on graceful shutdown.
            if (deliveries.size < 4) {
              const input = body as z.infer<typeof emailBody>;
              const task = service
                .request(
                  input.email,
                  operation,
                  emailConfirmationReturnPath(input.returnTo),
                )
                .catch(() => {
                  request.log.warn(
                    { event: 'AUTH_EMAIL_REQUEST_FAILED' },
                    'Authentication email request failed',
                  );
                });
              deliveries.add(task);
              void task.then(() => {
                deliveries.delete(task);
              });
            } else {
              request.log.warn(
                { event: 'AUTH_EMAIL_CAPACITY_REACHED' },
                'Authentication email capacity reached',
              );
            }
            return reply.code(202).send({ accepted: true });
          }
          if (operation === 'confirm') {
            const { token, password } = body as z.infer<typeof completeBody>;
            if (!(await service.complete(token, password)))
              return reply
                .code(400)
                .send({ error: { code: 'INVALID_AUTH_LINK' } });
            return reply.code(204).send();
          }
          const { email, password } = body as z.infer<typeof loginBody>;
          const token = await service.login(email, password);
          if (!token)
            return reply
              .code(401)
              .send({ error: { code: 'INVALID_CREDENTIALS' } });
          setSessionCookie(reply, token, config);
          return reply.code(204).send();
        } catch (error) {
          if (error instanceof PasswordBusyError)
            return reply
              .header('Retry-After', '2')
              .code(429)
              .send({ error: { code: 'AUTH_RATE_LIMITED' } });
          throw error;
        }
      },
    );
  }
}
