export const audience: string;
export function requestAudience(
  operation: string,
  manifestSha256: string,
): string;
export const repository: string;
export const workflow: string;
export function digest(bytes: string | Uint8Array): string;
export function privatePath(
  file: string,
  directory?: boolean,
  uid?: number,
  privateLeaf?: boolean,
): string;
export function verifyProof(
  token: string,
  jwks: { keys: unknown[] },
  expected: {
    sourceSha: string;
    runId: string;
    allowedActors: string[];
    operation: string;
    manifestSha256: string;
    approvedAt: number;
  },
  now?: number,
): { jtiHash: string; actorId: string; runAttempt: string };
export function validateRequest(
  deployment: Record<string, unknown>,
  approval: Record<string, unknown>,
  now?: number,
): Record<string, unknown>;
export type GitHubApi = (
  method: string,
  route: string,
  body?: unknown,
) => Promise<unknown>;
export function verifySource(api: GitHubApi, sourceSha: string): Promise<void>;
export function verifyActiveRun(
  api: GitHubApi,
  runId: string,
  proof: { actorId: string; runAttempt: string },
  approval: Record<string, unknown>,
): Promise<void>;
export function loadPrepared(
  approval: Record<string, unknown>,
  root: string,
  stateRoot: string,
  uid?: number,
): string;
export interface ControllerOptions {
  api: GitHubApi;
  jwks: { keys: unknown[] };
  root: string;
  stateRoot: string;
  receiptDir: string;
  uid?: number;
  now?: number;
  launch: (manifestFile: string) => number | null | Promise<number | null>;
}
export function handleDeployment(
  deployment: Record<string, unknown>,
  approval: Record<string, unknown>,
  options: ControllerOptions,
): Promise<string>;
export function processQueue(
  deployments: unknown[],
  approval: Record<string, unknown>,
  options: ControllerOptions,
): Promise<string>;
export function runOnce(configFile: string): Promise<string>;

export function createGitHubApi(
  token: string,
  fetcher?: typeof fetch,
): GitHubApi;
