import type { AutographStatus, WallStatus } from '@digital-autograph/domain';
import type { ProfileReview, RejectionReason } from '../lib/moderation-api';
export type Workspace = {
  profileSubmission?: ProfileReview | null;
  telegramReview?: {
    status:
      'queued' | 'running' | 'cleared' | 'pending' | 'approved' | 'rejected';
    reasonCode: RejectionReason | null;
  } | null;
  profile: {
    id: string;
    slug: string;
    displayName: string;
    avatarDataUrl?: string | null;
  } | null;
  autographs: {
    id: string;
    source: string;
    status: AutographStatus;
    createdAt: string;
  }[];
  walls: {
    id: string;
    status: WallStatus;
    slotCount: number;
    createdAt: string;
  }[];
  canModerate: boolean;
  canEditProfile: boolean;
};
export async function workspaceRequest<T>(
  origin: string,
  path: string,
  signal: AbortSignal,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const response = await fetch(origin + path, {
    credentials: 'include',
    cache: 'no-store',
    signal,
    method: body === undefined ? 'GET' : method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(
      response.status === 401
        ? 'SIGN_IN'
        : (result?.error?.code ?? 'REQUEST_FAILED'),
    );
  return result as T;
}
