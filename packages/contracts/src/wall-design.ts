import {
  wallDesignAlignments,
  wallDesignCoverPositions,
  wallDesignColorKeys,
  wallDesignFinishes,
  wallDesignPlaceKeys,
  wallDesignPatterns,
  wallDesignPodiums,
  wallDesignHex,
  wallDesignFrames,
  wallDesignLayouts,
  wallDesignThemes,
  wallDesignTypefaces,
} from '@digital-autograph/domain';
import { z } from 'zod';
import { creatorSlugParams } from './wall';

const copy = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) =>
      Array.from(value).every((character) => {
        const code = character.codePointAt(0)!;
        return (
          (code >= 32 || code === 9 || code === 10) &&
          (code < 0xd800 || code > 0xdfff)
        );
      }),
    );
const image = z.string().max(350000).nullable();
const wallDesign = z.strictObject({
  title: copy(100),
  description: copy(500),
  avatarDataUrl: image,
  coverDataUrl: image,
  style: z.strictObject({
    theme: z.enum(wallDesignThemes),
    layout: z.enum(wallDesignLayouts),
    alignment: z.enum(wallDesignAlignments),
    coverPosition: z.enum(wallDesignCoverPositions),
    typeface: z.enum(wallDesignTypefaces),
    frame: z.enum(wallDesignFrames),
    accent: z.string().regex(wallDesignHex),
    colors: z
      .partialRecord(
        z.enum(wallDesignColorKeys),
        z.string().regex(wallDesignHex),
      )
      .optional(),
    finish: z.enum(wallDesignFinishes).optional(),
    placeFinishes: z
      .partialRecord(z.enum(wallDesignPlaceKeys), z.enum(wallDesignFinishes))
      .optional(),
    pattern: z.enum(wallDesignPatterns).optional(),
    podium: z.enum(wallDesignPodiums).optional(),
    event: copy(80),
    actionLabel: copy(48),
  }),
});

const embeddedImage = z
  .string()
  .max(350000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .nullable();

export const wallDesignFileFormat = 'supcube-wall-design';
export const wallDesignFileVersion = 1;
export const wallDesignFile = z.strictObject({
  format: z.literal(wallDesignFileFormat),
  version: z.literal(wallDesignFileVersion),
  design: wallDesign.extend({
    avatarDataUrl: embeddedImage,
    coverDataUrl: embeddedImage,
  }),
});

export const saveWallDesignBody = z.strictObject({
  design: wallDesign,
  revision: z.uuid().nullable(),
});
export const createWallDesignTemplateBody = z.strictObject({
  author: creatorSlugParams.shape.slug,
  design: wallDesign,
});
export const wallDesignTemplateToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const previewWallDesignTemplateBody = z.strictObject({
  token: wallDesignTemplateToken,
});
