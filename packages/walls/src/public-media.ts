export type PublicPlacementMediaResolution =
  | { kind: 'available'; storageKey: string; verifiedSizeBytes: number }
  | { kind: 'not_found' | 'inconsistent' };

export interface PublicPlacementMediaRepository {
  resolveActive(placementId: string): Promise<PublicPlacementMediaResolution>;
}

export interface PrivateCleanedMediaStorage {
  getPrivateObject(key: string, maxBytes: number): Promise<Buffer>;
}

export type PublicPlacementMediaFailure =
  | 'not_found'
  | 'inconsistent'
  | 'missing_object'
  | 'storage_unavailable'
  | 'invalid_object';

export class PublicPlacementMediaError extends Error {
  constructor(readonly reason: PublicPlacementMediaFailure) {
    super('Public placement media unavailable');
  }
}

const maxCleanedBytes = 10 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class PublicPlacementMediaService {
  constructor(
    private readonly repository: PublicPlacementMediaRepository,
    private readonly storage: PrivateCleanedMediaStorage,
  ) {}

  async getActivePng(placementId: string): Promise<Buffer> {
    const resolution = await this.repository.resolveActive(placementId);
    if (resolution.kind !== 'available') {
      throw new PublicPlacementMediaError(resolution.kind);
    }
    const { storageKey, verifiedSizeBytes } = resolution;
    if (
      !Number.isSafeInteger(verifiedSizeBytes) ||
      verifiedSizeBytes < 1 ||
      verifiedSizeBytes > maxCleanedBytes
    ) {
      throw new PublicPlacementMediaError('invalid_object');
    }
    let bytes: Buffer;
    try {
      bytes = await this.storage.getPrivateObject(
        storageKey,
        verifiedSizeBytes,
      );
    } catch (error) {
      const status =
        error instanceof Error && '$metadata' in error
          ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
          : undefined;
      throw new PublicPlacementMediaError(
        status === 404 ? 'missing_object' : 'storage_unavailable',
      );
    }
    if (
      bytes.length !== verifiedSizeBytes ||
      !bytes.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      throw new PublicPlacementMediaError('invalid_object');
    }
    return bytes;
  }
}
