import { wallDesignTemplateToken } from '@digital-autograph/contracts';

export const wallDesignPath = '/me/walls/design';
export const wallDesignTemplatesPath = '/me/walls/design/templates';

export function wallDesignTemplateLink(origin: string, token: string) {
  return `${origin}${wallDesignPath}#template=${token}`;
}

export function wallDesignTokenFromLink(value: string, origin: string) {
  try {
    const url = new URL(value.trim());
    if (
      url.origin !== origin ||
      url.pathname !== wallDesignPath ||
      url.username ||
      url.password ||
      url.search ||
      !url.hash.startsWith('#template=')
    )
      return null;
    const token = wallDesignTemplateToken.safeParse(
      url.hash.slice('#template='.length),
    );
    return token.success ? token.data : null;
  } catch {
    return null;
  }
}
