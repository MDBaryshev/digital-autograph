import { expect, it } from 'vitest';
import { ownerSharesPageSchema, ownerSharesQuery } from './notifications';

const id = '11111111-1111-4111-8111-111111111111';
const item = {
  id,
  wallId: '22222222-2222-4222-8222-222222222222',
  slotNumber: 1,
  event: 'slot_claimed',
  publicAlias: 'My autograph',
  createdAt: '2026-11-12T12:00:00.000Z',
  revokedAt: null,
};

it('defaults and bounds owner share pagination without accepting actor selectors', () => {
  expect(ownerSharesQuery.parse({})).toEqual({ limit: 20 });
  expect(ownerSharesQuery.parse({ limit: '50', cursor: id })).toEqual({
    limit: 50,
    cursor: id,
  });
  for (const input of [
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { limit: ['1', '2'] },
    { cursor: 'invalid' },
    { userId: id },
    { offset: 2 },
  ])
    expect(ownerSharesQuery.safeParse(input).success).toBe(false);
});

it('permits only the private owner DTO and a bounded page', () => {
  expect(
    ownerSharesPageSchema.parse({ items: [item], nextCursor: id }),
  ).toEqual({ items: [item], nextCursor: id });
  for (const extra of ['userId', 'placementId', 'slotId', 'storageKey'])
    expect(
      ownerSharesPageSchema.safeParse({
        items: [{ ...item, [extra]: id }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  expect(
    ownerSharesPageSchema.safeParse({
      items: Array.from({ length: 51 }, () => item),
      nextCursor: null,
    }).success,
  ).toBe(false);
});

it.each([
  { id: 'invalid' },
  { slotNumber: 0 },
  { event: 'unknown' },
  { createdAt: 'yesterday' },
  { revokedAt: 'invalid' },
])('rejects a malformed owner share field: %j', (change) => {
  expect(
    ownerSharesPageSchema.safeParse({
      items: [{ ...item, ...change }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});
