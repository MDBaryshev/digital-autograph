import { z } from 'zod';

export function loadOpenRouterConfig(env = process.env) {
  const generation = env.AI_AUTOGRAPH_GENERATION_ENABLED === 'true';
  const moderation = env.AI_AUTOGRAPH_MODERATION_ENABLED === 'true';
  for (const key of [
    'AI_AUTOGRAPH_GENERATION_ENABLED',
    'AI_AUTOGRAPH_MODERATION_ENABLED',
  ])
    if (env[key] !== undefined && !['true', 'false'].includes(env[key]!))
      throw Error('Invalid AI feature configuration');
  if (!generation && !moderation) return null;
  try {
    const model = z.string().min(1).max(200);
    return {
      key: z.string().min(16).parse(env.OPENROUTER_API_KEY),
      generationModel: generation
        ? model.parse(env.OPENROUTER_IMAGE_MODEL)
        : null,
      moderationModel: moderation
        ? model.parse(env.OPENROUTER_MODERATION_MODEL)
        : null,
      moderatorId: moderation ? z.uuid().parse(env.AI_MODERATOR_USER_ID) : null,
    };
  } catch {
    throw Error('Invalid OpenRouter configuration (values redacted)');
  }
}
