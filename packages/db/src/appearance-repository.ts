import type { Pool } from 'pg';
import {
  createPgProfileModerationRepository,
  profileContentHash,
  savePrivateProviderAvatar,
  type SubmissionMetadata,
} from './profile-moderation-repository';

export type WallAppearance = {
  title: string;
  description: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
};
export type PrivateAppearance = WallAppearance & {
  providerAvatarDataUrl: string | null;
  avatarSource: 'provider' | 'upload' | 'none' | null;
};
const empty: PrivateAppearance = {
  title: '',
  description: '',
  avatarDataUrl: null,
  coverDataUrl: null,
  providerAvatarDataUrl: null,
  avatarSource: null,
};
export function createPgAppearanceRepository(pool: Pool) {
  const moderation = createPgProfileModerationRepository(pool);
  return {
    async read(userId: string) {
      const r = await pool.query(
        `SELECT title,description,avatar_source AS "avatarSource",avatar_data_url AS "avatarDataUrl",cover_data_url AS "coverDataUrl",provider_avatar_data_url AS "providerAvatarDataUrl" FROM account_appearance WHERE user_id=$1`,
        [userId],
      );
      const published: PrivateAppearance = r.rows[0] ?? { ...empty };
      const submission = await moderation.latest(userId, 'appearance');
      const selected = submission
        ? {
            title: submission.title!,
            description: submission.description!,
            avatarSource: submission.avatarSource,
            avatarDataUrl: submission.avatarDataUrl,
            coverDataUrl: submission.coverDataUrl,
          }
        : published;
      return {
        ...published,
        ...selected,
        providerAvatarHash: published.providerAvatarDataUrl
          ? profileContentHash(published.providerAvatarDataUrl)
          : null,
        selectedProviderAvatarHash:
          selected.avatarSource === 'provider' && selected.avatarDataUrl
            ? profileContentHash(selected.avatarDataUrl)
            : null,
        moderation: submission
          ? {
              id: submission.id,
              status: submission.status,
              reasonCode: submission.reasonCode,
            }
          : null,
      };
    },
    async save(
      userId: string,
      input: WallAppearance,
      avatarSource: 'provider' | 'upload' | 'none',
      metadata: SubmissionMetadata & { providerAvatarHash?: string } = {},
    ) {
      const submission = await moderation.submit(
        userId,
        {
          kind: 'appearance',
          ...input,
          avatarSource,
          ...(metadata.providerAvatarHash
            ? { providerAvatarHash: metadata.providerAvatarHash }
            : {}),
        },
        metadata,
      );
      return {
        saved: true,
        submissionId: submission.id,
        status: submission.status,
      };
    },
    async saveProviderAvatar(userId: string, dataUrl: string) {
      // Private candidate only: login never replaces a published/custom avatar.
      await savePrivateProviderAvatar(pool, userId, dataUrl);
    },
  };
}
export type AppearanceRepository = ReturnType<
  typeof createPgAppearanceRepository
>;
