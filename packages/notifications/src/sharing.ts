export type PublicShare = {
  id: string;
  wallId: string;
  slotId: string | null;
  slotNumber: number | null;
  creator: string;
  publicAlias: string | null;
  event: 'slot_claimed' | 'takeover' | 'final_wall';
};
export type OwnedShare = {
  id: string;
  wallId: string;
  slotNumber: number | null;
  event: PublicShare['event'];
  publicAlias: string | null;
  createdAt: string;
  revokedAt: string | null;
};
export type OwnedSharePage = {
  items: OwnedShare[];
  nextCursor: string | null;
};
export interface ShareRepository {
  list(userId: string, limit: number, cursor?: string): Promise<OwnedSharePage>;
  create(
    userId: string,
    // Legacy optional field is retained at this port only to reject it explicitly.
    // Public custom text requires a separate content-review flow.
    input: { wallId: string; slotId?: string; publicAlias?: string },
  ): Promise<PublicShare>;
  public(id: string): Promise<PublicShare | null>;
  revoke(userId: string, id: string): Promise<void>;
  interact(
    id: string,
    kind: 'share_clicked' | 'referral_arrived',
    dedupeKey: string,
  ): Promise<void>;
}
