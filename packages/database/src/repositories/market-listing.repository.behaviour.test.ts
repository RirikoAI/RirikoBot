import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { MarketListingRepository } from './market-listing.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-08-01T00:00:00Z');
const HOUR = 3_600_000;

const listing = (seller: string, price: number, overrides: Record<string, unknown> = {}) => ({
  sellerUserId: seller,
  userCardId: randomUUID(),
  price,
  expiresAt: new Date(T0.getTime() + 24 * HOUR),
  ...overrides,
});

describeDialects('MarketListingRepository behaviour', (db) => {
  it('creates a listing with defaults and reads it back', async () => {
    const repo = new MarketListingRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);

    const created = await repo.create(listing('seller', 500));
    expect(created.price).toBe(500);
    expect(created.taxPaid).toBe(0);
    expect(created.status).toBe('ACTIVE');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.expiresAt.getTime()).toBe(T0.getTime() + 24 * HOUR);

    expect((await repo.findById(created.id))?.sellerUserId).toBe('seller');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);
  });

  it('keeps an explicit id, tax, status and creation time', async () => {
    const repo = new MarketListingRepository(db.client);
    const id = randomUUID();

    const created = await repo.create(
      listing('seller', 900, { id, taxPaid: 45, status: 'SOLD', createdAt: T0 }),
    );

    expect(created.id).toBe(id);
    expect(created.taxPaid).toBe(45);
    expect(created.status).toBe('SOLD');
    expect(created.createdAt.getTime()).toBe(T0.getTime());
  });

  it('wraps a duplicate id in a DatabaseError', async () => {
    const repo = new MarketListingRepository(db.client);
    const created = await repo.create(listing('seller', 500));

    await expect(repo.create(listing('seller', 600, { id: created.id }))).rejects.toThrow(
      /Failed to create market listing/,
    );
  });

  it('updates a listing, coercing price and tax, and throws for a missing one', async () => {
    const repo = new MarketListingRepository(db.client);
    const created = await repo.create(listing('seller', 500));

    const updated = await repo.update(created.id, { price: 750, taxPaid: 30 });
    expect(updated.price).toBe(750);
    expect(updated.taxPaid).toBe(30);
    expect((await repo.update(created.id, { status: 'CANCELLED' })).price).toBe(750);

    await expect(repo.update(MISSING_UUID, { price: 1 })).rejects.toThrow(DatabaseError);
    await expect(repo.update(created.id, { expiresAt: 'bad' as never })).rejects.toThrow(
      /Failed to update market listing/,
    );
  });

  it('sets a listing status directly', async () => {
    const repo = new MarketListingRepository(db.client);
    const created = await repo.create(listing('seller', 500));

    expect((await repo.updateStatus(created.id, 'EXPIRED')).status).toBe('EXPIRED');
    await expect(repo.updateStatus(MISSING_UUID, 'SOLD')).rejects.toThrow(DatabaseError);
  });

  it('moves a listing between statuses only from the expected one', async () => {
    const repo = new MarketListingRepository(db.client);
    const created = await repo.create(listing('seller', 500));

    const claimed = await repo.transitionStatus(created.id, 'ACTIVE', 'SOLD');
    expect(claimed?.status).toBe('SOLD');
    expect(await repo.transitionStatus(created.id, 'ACTIVE', 'CANCELLED')).toBeNull();
    expect(await repo.transitionStatus(MISSING_UUID, 'ACTIVE', 'SOLD')).toBeNull();
    expect((await repo.findById(created.id))?.status).toBe('SOLD');
  });

  it('lists active listings newest first, by seller, with paging, and counts them', async () => {
    const repo = new MarketListingRepository(db.client);
    const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
    const a = await repo.create(listing('s1', 100, { createdAt: at(1) }));
    const b = await repo.create(listing('s2', 200, { createdAt: at(2) }));
    const c = await repo.create(listing('s1', 300, { createdAt: at(3) }));
    await repo.create(listing('s1', 400, { createdAt: at(4), status: 'SOLD' }));

    expect((await repo.listActiveListings()).map((l) => l.id)).toEqual([c.id, b.id, a.id]);
    expect((await repo.listActiveListings({ sellerUserId: 's1' })).map((l) => l.id)).toEqual([
      c.id,
      a.id,
    ]);
    expect((await repo.listActiveListings({ limit: 1, offset: 1 })).map((l) => l.id)).toEqual([
      b.id,
    ]);
    expect(await repo.countActiveListings()).toBe(3);
    expect(await repo.countActiveListings({ sellerUserId: 's1' })).toBe(2);
    expect(await repo.countActiveListings({ sellerUserId: 'nobody' })).toBe(0);
  });

  it('lists every listing of a seller, any status, newest first', async () => {
    const repo = new MarketListingRepository(db.client);
    const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
    const old = await repo.create(listing('s1', 100, { createdAt: at(1), status: 'CANCELLED' }));
    const fresh = await repo.create(listing('s1', 200, { createdAt: at(2) }));
    await repo.create(listing('s2', 300));

    expect((await repo.listUserListings('s1')).map((l) => l.id)).toEqual([fresh.id, old.id]);
    expect(await repo.listUserListings('nobody')).toEqual([]);
  });

  it('finds active listings that expired at or before a moment', async () => {
    const repo = new MarketListingRepository(db.client);
    const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
    const early = await repo.create(listing('s1', 100, { expiresAt: at(1) }));
    const exact = await repo.create(listing('s1', 200, { expiresAt: at(2) }));
    await repo.create(listing('s1', 300, { expiresAt: at(5) }));
    await repo.create(listing('s1', 400, { expiresAt: at(1), status: 'SOLD' }));

    const expired = await repo.findExpiredListings(at(2));
    expect(expired.map((l) => l.id).sort()).toEqual([early.id, exact.id].sort());
    expect(await repo.findExpiredListings(at(0))).toEqual([]);
    expect(Array.isArray(await repo.findExpiredListings())).toBe(true);
  });

  it('deletes a listing once', async () => {
    const repo = new MarketListingRepository(db.client);
    const created = await repo.create(listing('seller', 500));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
