const sendEndpoint =
  'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json';

async function accepted(response: Response, email: string) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    return false;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 16384) return false;
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return (
    result?.status === 'success' &&
    typeof result.job_id === 'string' &&
    result.job_id.length > 0 &&
    (!result.failed_emails || Object.keys(result.failed_emails).length === 0) &&
    (result.emails === undefined ||
      (Array.isArray(result.emails) && result.emails.includes(email)))
  );
}

export function createAuthEmailSender(
  config: { apiKey: string; from: string; webOrigin: string },
  fetcher = fetch,
) {
  return {
    async send(input: {
      email: string;
      purpose: 'register' | 'reset';
      token: string;
      returnTo?: string;
    }) {
      const { email, purpose, token, returnTo } = input;
      const registering = purpose === 'register';
      const link = new URL('/auth/email/confirm', config.webOrigin);
      const fragment = new URLSearchParams({ token });
      if (returnTo) fragment.set('returnTo', returnTo);
      link.hash = fragment.toString();
      try {
        const response = await fetcher(sendEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': config.apiKey,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            message: {
              recipients: [{ email }],
              from_email: config.from,
              from_name: 'supcube',
              subject: registering
                ? 'supcube — подтвердите почту'
                : 'supcube — восстановление пароля',
              body: {
                plaintext: `Чтобы ${registering ? 'подтвердить почту и создать пароль' : 'установить новый пароль'}, откройте ссылку.\n\n${link.href}\n\nСсылка действует 30 минут и используется один раз. Если вы не запрашивали это письмо, проигнорируйте его.`,
              },
              track_read: 0,
              track_links: 0,
              template_engine: 'none',
              global_language: 'ru',
            },
          }),
        });
        if (!(await accepted(response, email))) throw new Error();
      } catch {
        throw new Error('Authentication email delivery failed');
      }
    },
  };
}
