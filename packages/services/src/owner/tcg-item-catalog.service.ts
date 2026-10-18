import { randomUUID } from 'node:crypto';
import {
  TcgGearInputSchema,
  TcgShopFieldsInputSchema,
  tcgGearBaseStats,
  tcgGearType,
  ValidationError,
  type TcgGearInput,
  type TcgShopFieldsInput,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type GameItem,
  type GameItemRepository,
  type UserInventoryItemRepository,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../waifu-tcg/equipment/catalog.js';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';

export interface TcgItemCatalogServiceDeps {
  db: DatabaseClient;
  items: GameItemRepository;
  inventories: UserInventoryItemRepository;
  audit: AuditLogRepository;
  now?: () => Date;
}

export interface TcgItemView {
  item: GameItem;
  /** Players holding at least one; held items can only be taken off sale. */
  holders: number;
  /** Seeded by the bot at every start: only the shop fields can change. */
  canonical: boolean;
}

const CANONICAL_CODES = new Set(CANONICAL_ITEMS.map((item) => item.code));

function refuse(message: string): never {
  throw new ValidationError(message);
}

function invalid(fieldErrors: Record<string, string[]>, subject: string): never {
  throw new GuildConfigValidationError(fieldErrors, subject);
}

function shopFieldsOf(item: GameItem): TcgShopFieldsInput {
  return {
    isShopBuyable: item.isShopBuyable,
    shopPrice: Number(item.shopPrice),
    maxDailyPurchases: item.maxDailyPurchases,
  };
}

function gearRow(input: TcgGearInput) {
  return {
    name: input.name,
    description: input.description,
    type: tcgGearType(input.subtype),
    subtype: input.subtype,
    rarity: input.rarity,
    baseStats: tcgGearBaseStats(input),
    battlePerks: input.battlePerks,
    isTradeable: input.isTradeable,
    isShopBuyable: input.isShopBuyable,
    shopPrice: input.shopPrice,
    maxDailyPurchases: input.maxDailyPurchases,
  };
}

function comparableGear(item: GameItem): Record<string, unknown> {
  return {
    name: item.name,
    description: item.description,
    type: item.type,
    subtype: item.subtype,
    rarity: item.rarity,
    baseStats: sortedKeys(item.baseStats ?? {}),
    battlePerks: item.battlePerks ?? [],
    isTradeable: item.isTradeable,
    ...shopFieldsOf(item),
  };
}

function sortedKeys(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function itemDetails(item: GameItem): Record<string, unknown> {
  return { itemId: item.id, code: item.code, name: item.name };
}

/**
 * The global Waifu TCG item catalog (`game_items`) for the owner console. The bot rewrites
 * canonical items from `CANONICAL_ITEMS` at every start, so for those only the shop fields
 * change here, and saving them sets `ownerOverridden` so the sync keeps them. Custom gear
 * (codes `CUSTOM_…`) is fully editable, and can be deleted once it is off sale and nobody holds
 * one. Every write runs in one transaction with its audit entry, recorded without a guild.
 */
export class TcgItemCatalogService {
  private readonly now: () => Date;

  constructor(private readonly deps: TcgItemCatalogServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async listItems(): Promise<TcgItemView[]> {
    const [items, holders] = await Promise.all([
      this.deps.items.findAll(),
      this.deps.inventories.holderCountsByItem(),
    ]);
    return items
      .map((item) => ({
        item,
        holders: holders.get(item.id) ?? 0,
        canonical: CANONICAL_CODES.has(item.code),
      }))
      .sort(
        (a, b) =>
          a.item.type.localeCompare(b.item.type) ||
          a.item.subtype.localeCompare(b.item.subtype) ||
          a.item.name.localeCompare(b.item.name),
      );
  }

  async getItem(itemId: string): Promise<TcgItemView | null> {
    const item = await this.deps.items.findById(itemId);
    if (!item) return null;
    return {
      item,
      holders: await this.deps.inventories.countHolders(item.id),
      canonical: CANONICAL_CODES.has(item.code),
    };
  }

  /** Price, purchase limit and on-sale of any item; kept through bot restarts. */
  async updateShopFields(
    itemId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ item: GameItem; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      const parsed = TcgShopFieldsInputSchema.safeParse(raw);
      if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'TCG item');

      const changes = diffFields(shopFieldsOf(existing), parsed.data);
      if (changes.length === 0) return { item: existing, changed: false };
      const item = await this.deps.items.update(
        existing.id,
        { ...parsed.data, ownerOverridden: true },
        tx,
      );
      await this.record('owner.tcg_item.shop', actor, { ...itemDetails(item), changes }, tx);
      return { item, changed: true };
    });
  }

  async createGear(raw: Record<string, unknown>, actor: GuildConfigActor): Promise<GameItem> {
    return withTransaction(this.deps.db, async (tx) => {
      const input = this.parseGear(raw);
      if (await this.deps.items.findByCode(input.code, tx)) {
        invalid({ code: ['Another item uses this code.'] }, 'TCG item');
      }
      const item = await this.deps.items.create(
        { id: randomUUID(), code: input.code, ...gearRow(input), consumableEffect: {} },
        tx,
      );
      await this.record('owner.tcg_item.create', actor, itemDetails(item), tx);
      return item;
    });
  }

  /** Saves every field of a custom gear piece; its code never changes. */
  async updateGear(
    itemId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ item: GameItem; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      if (CANONICAL_CODES.has(existing.code)) {
        refuse('Built-in items are reset by the bot at start; only their shop fields can change.');
      }
      const input = this.parseGear({ ...raw, code: existing.code });
      const after = gearRow(input);
      const changes = diffFields(comparableGear(existing), {
        ...after,
        baseStats: sortedKeys(after.baseStats),
      });
      if (changes.length === 0) return { item: existing, changed: false };
      const item = await this.deps.items.update(existing.id, after, tx);
      await this.record('owner.tcg_item.update', actor, { ...itemDetails(item), changes }, tx);
      return { item, changed: true };
    });
  }

  /**
   * Deletes a custom piece that is off sale and held by nobody. Taking it off sale first stops
   * purchases, so none can land between the holder check and the delete.
   */
  async deleteGear(itemId: string, actor: GuildConfigActor): Promise<void> {
    await withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      if (CANONICAL_CODES.has(existing.code)) {
        refuse('Built-in items come back when the bot starts, so take them off sale instead.');
      }
      if (existing.isShopBuyable) refuse('Take the item off sale first, then delete it.');
      const holders = await this.deps.inventories.countHolders(existing.id, tx);
      if (holders > 0) {
        refuse(
          `${holders === 1 ? '1 player holds' : `${holders} players hold`} this item, so it can only be taken off sale.`,
        );
      }
      await this.deps.items.delete(existing.id, tx);
      await this.record('owner.tcg_item.delete', actor, itemDetails(existing), tx);
    });
  }

  private parseGear(raw: Record<string, unknown>): TcgGearInput {
    const parsed = TcgGearInputSchema.safeParse(raw);
    if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'TCG item');
    return parsed.data;
  }

  private async requireItem(itemId: string, tx: DatabaseClient): Promise<GameItem> {
    const item = await this.deps.items.findById(itemId, tx);
    if (!item) refuse('This item no longer exists.');
    return item;
  }

  private async record(
    action: string,
    actor: GuildConfigActor,
    details: Record<string, unknown>,
    tx: DatabaseClient,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId: null,
        actorUserId: actor.userId,
        action,
        details: { source: actor.source, ...details },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
      this.now(),
      tx,
    );
  }
}
