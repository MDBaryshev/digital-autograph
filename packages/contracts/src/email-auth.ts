const publicWall = /^\/walls\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const accountPages = new Set([
  '/me/settings',
  '/me/walls',
  '/me/autographs',
  '/me/placements',
  '/moderation',
  '/autograph/create',
]);

// These destinations may travel through the mail provider in a confirmation link.
export function emailConfirmationReturnPath(
  value: string | null | undefined,
): string | undefined {
  if (!value || value.length > 512) return undefined;
  if (accountPages.has(value) || publicWall.test(value)) return value;
  if (value === '/legal/first-use') return value;

  const prefix = '/legal/first-use?';
  if (!value.startsWith(prefix) || value.includes('#')) return undefined;
  const params = new URLSearchParams(value.slice(prefix.length));
  const destination = params.get('returnTo');
  if (
    params.size !== 1 ||
    !destination ||
    (destination !== '/autograph/create' && !publicWall.test(destination))
  )
    return undefined;

  return prefix + new URLSearchParams({ returnTo: destination });
}
