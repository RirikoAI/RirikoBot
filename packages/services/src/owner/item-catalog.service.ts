import { randomUUID } from 'node:crypto';
import {
  ShopCategoryInputSchema,
  ShopItemInputSchema,
  shopItemMetadata,
  ValidationError,
  type ShopItemInput,
} from '@ririko/core';
import {
  DEFAULT_ITEM_CATEGORY_CODES,
  DEFAULT_SHOP_ITEM_CODES,
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type EconomyItem,
  type EconomyItemCategory,
  type InventoryRepository,
  type ItemCategoryRepository,
  type ItemRepository,
} from '@ririko/database';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';

export interface ItemCatalogServiceDeps {
  db: DatabaseClient;
  items: ItemRepository;
  categories: ItemCategoryRepository;
  inventories: InventoryRepository;
  audit: AuditLogRepository;
  now?: () => Date;
}

export interface CatalogItemView {
  item: EconomyItem;
  categoryName: string | null;
  /** Members holding the item; held items can only be retired. */
  holders: number;
  /** From the default catalog, which the bot re-creates on start, so it can only be retired. */
  seeded: boolean;
}

export interface CatalogCategoryView {
  category: EconomyItemCategory;
  items: number;
  seeded: boolean;
}

/** A refusal the owner should read, such as deleting an item members hold. */
function refuse(message: string): never {
  throw new ValidationError(message);
}

function invalid(fieldErrors: Record<string, string[]>, subject: string): never {
  throw new GuildConfigValidationError(fieldErrors, subject);
}

/** The fields of an item row that the editor writes. */
function itemRow(input: ShopItemInput, previousMetadata: Record<string, unknown> | null) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    price: input.price,
    rarity: input.rarity,
    categoryId: input.categoryId,
    iconUrl: input.iconUrl,
    isPurchasable: input.isPurchasable,
    metadata: shopItemMetadata(input, previousMetadata),
  };
}

/**
 * The global item shop for the owner console: items (`economy_items`) and their categories.
 * Every write runs in one transaction with its audit entry, recorded without a guild.
 *
 * Items members hold are never deleted, since their inventories point at them; they are
 * retired (no longer sold) instead. Items and categories from the default catalog are only
 * retired too, because the bot seeds any that are missing when it starts.
 */
export class ItemCatalogService {
  private readonly now: () => Date;

  constructor(private readonly deps: ItemCatalogServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async listItems(): Promise<CatalogItemView[]> {
    const [items, categories, holders] = await Promise.all([
      this.deps.items.findAll(),
      this.deps.categories.findAll(),
      this.deps.inventories.holderCountsByItem(),
    ]);
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    return items
      .map((item) => ({
        item,
        categoryName: item.categoryId ? (categoryNames.get(item.categoryId) ?? null) : null,
        holders: holders.get(item.id) ?? 0,
        seeded: isSeededItem(item),
      }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  }

  async getItem(itemId: string): Promise<CatalogItemView | null> {
    const item = await this.deps.items.findById(itemId);
    if (!item) return null;
    const [category, holders] = await Promise.all([
      item.categoryId ? this.deps.categories.findById(item.categoryId) : null,
      this.deps.inventories.countHolders(item.id),
    ]);
    return { item, categoryName: category?.name ?? null, holders, seeded: isSeededItem(item) };
  }

  async listCategories(): Promise<CatalogCategoryView[]> {
    const categories = await this.deps.categories.findAll();
    return Promise.all(
      categories.map(async (category) => ({
        category,
        items: await this.deps.categories.countItems(category.id),
        seeded: isSeededCategory(category),
      })),
    );
  }

  async createItem(raw: Record<string, unknown>, actor: GuildConfigActor): Promise<EconomyItem> {
    return withTransaction(this.deps.db, async (tx) => {
      const input = this.parseItem(raw);
      await this.checkItemReferences(input, null, tx);
      const item = await this.deps.items.create({ id: randomUUID(), ...itemRow(input, null) }, tx);
      await this.record('owner.shop_item.create', actor, itemDetails(item), tx);
      return item;
    });
  }

  /** Saves the editor's values; a code, once set, stays. Nothing is written when nothing changed. */
  async updateItem(
    itemId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ item: EconomyItem; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      const input = this.parseItem({ ...raw, code: existing.code ?? raw['code'] });
      await this.checkItemReferences(input, existing, tx);

      const after = itemRow(input, existing.metadata ?? null);
      const changes = diffFields(comparableItem(existing), {
        ...after,
        metadata: sortedKeys(after.metadata),
      });
      if (changes.length === 0) return { item: existing, changed: false };

      const item = await this.deps.items.update(existing.id, after, tx);
      await this.record('owner.shop_item.update', actor, { ...itemDetails(item), changes }, tx);
      return { item, changed: true };
    });
  }

  /** Retires an item (no longer sold) or puts it back on sale. */
  async setPurchasable(
    itemId: string,
    purchasable: boolean,
    actor: GuildConfigActor,
  ): Promise<EconomyItem> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      if (existing.isPurchasable === purchasable) return existing;
      const item = await this.deps.items.update(existing.id, { isPurchasable: purchasable }, tx);
      await this.record(
        purchasable ? 'owner.shop_item.restore' : 'owner.shop_item.retire',
        actor,
        itemDetails(item),
        tx,
      );
      return item;
    });
  }

  /**
   * Deletes a retired item nobody holds. Retiring first stops sales, so no purchase can land
   * between the holder check and the delete.
   */
  async deleteItem(itemId: string, actor: GuildConfigActor): Promise<void> {
    await withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireItem(itemId, tx);
      if (isSeededItem(existing)) {
        refuse(
          'Items from the default catalog come back when the bot starts, so retire them instead.',
        );
      }
      if (existing.isPurchasable) refuse('Retire the item first, then delete it.');
      const holders = await this.deps.inventories.countHolders(existing.id, tx);
      if (holders > 0) {
        refuse(
          `${holders === 1 ? '1 member holds' : `${holders} members hold`} this item, so it can only be retired.`,
        );
      }
      await this.deps.items.delete(existing.id, tx);
      await this.record('owner.shop_item.delete', actor, itemDetails(existing), tx);
    });
  }

  async createCategory(
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<EconomyItemCategory> {
    return withTransaction(this.deps.db, async (tx) => {
      const input = this.parseCategory(raw);
      await this.checkCategoryUnique(input.code, input.name, null, tx);
      const category = await this.deps.categories.create({ id: randomUUID(), ...input }, tx);
      await this.record('owner.shop_category.create', actor, categoryDetails(category), tx);
      return category;
    });
  }

  async updateCategory(
    categoryId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ category: EconomyItemCategory; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.deps.categories.findById(categoryId, tx);
      if (!existing) refuse('This category no longer exists.');
      const input = this.parseCategory({ ...raw, code: existing.code ?? raw['code'] });
      await this.checkCategoryUnique(input.code, input.name, existing.id, tx);

      const changes = diffFields(
        { code: existing.code, name: existing.name, description: existing.description },
        input,
      );
      if (changes.length === 0) return { category: existing, changed: false };
      const category = await this.deps.categories.update(existing.id, input, tx);
      await this.record(
        'owner.shop_category.update',
        actor,
        { ...categoryDetails(category), changes },
        tx,
      );
      return { category, changed: true };
    });
  }

  async deleteCategory(categoryId: string, actor: GuildConfigActor): Promise<void> {
    await withTransaction(this.deps.db, async (tx) => {
      const existing = await this.deps.categories.findById(categoryId, tx);
      if (!existing) refuse('This category no longer exists.');
      if (isSeededCategory(existing)) {
        refuse('Categories from the default catalog come back when the bot starts.');
      }
      const items = await this.deps.categories.countItems(existing.id, tx);
      if (items > 0) {
        refuse(
          `${items === 1 ? '1 item is' : `${items} items are`} still in this category. Move them first.`,
        );
      }
      await this.deps.categories.delete(existing.id, tx);
      await this.record('owner.shop_category.delete', actor, categoryDetails(existing), tx);
    });
  }

  private parseItem(raw: Record<string, unknown>): ShopItemInput {
    const parsed = ShopItemInputSchema.safeParse(raw);
    if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'shop item');
    return parsed.data;
  }

  private parseCategory(raw: Record<string, unknown>) {
    const parsed = ShopCategoryInputSchema.safeParse(raw);
    if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'item category');
    return parsed.data;
  }

  private async requireItem(itemId: string, tx: DatabaseClient): Promise<EconomyItem> {
    const item = await this.deps.items.findById(itemId, tx);
    if (!item) refuse('This item no longer exists.');
    return item;
  }

  /** The code must be free and the category must exist. */
  private async checkItemReferences(
    input: ShopItemInput,
    existing: EconomyItem | null,
    tx: DatabaseClient,
  ): Promise<void> {
    const fieldErrors: Record<string, string[]> = {};
    const owner = await this.deps.items.findByCode(input.code, tx);
    if (owner && owner.id !== existing?.id) fieldErrors['code'] = ['Another item uses this code.'];
    if (input.categoryId && !(await this.deps.categories.findById(input.categoryId, tx))) {
      fieldErrors['categoryId'] = ['This category no longer exists.'];
    }
    if (Object.keys(fieldErrors).length > 0) invalid(fieldErrors, 'shop item');
  }

  private async checkCategoryUnique(
    code: string,
    name: string,
    selfId: string | null,
    tx: DatabaseClient,
  ): Promise<void> {
    const fieldErrors: Record<string, string[]> = {};
    const others = (await this.deps.categories.findAll(tx)).filter(
      (category) => category.id !== selfId,
    );
    if (others.some((category) => category.code === code)) {
      fieldErrors['code'] = ['Another category uses this code.'];
    }
    if (others.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      fieldErrors['name'] = ['Another category has this name.'];
    }
    if (Object.keys(fieldErrors).length > 0) invalid(fieldErrors, 'item category');
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

function isSeededItem(item: EconomyItem): boolean {
  return item.code !== null && DEFAULT_SHOP_ITEM_CODES.includes(item.code);
}

function isSeededCategory(category: EconomyItemCategory): boolean {
  return category.code !== null && DEFAULT_ITEM_CATEGORY_CODES.includes(category.code);
}

function comparableItem(item: EconomyItem): Record<string, unknown> {
  return {
    code: item.code,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    rarity: item.rarity,
    categoryId: item.categoryId,
    iconUrl: item.iconUrl,
    isPurchasable: item.isPurchasable,
    metadata: sortedKeys(item.metadata ?? {}),
  };
}

/** Metadata with its keys in order, so a re-save that only reorders keys changes nothing. */
function sortedKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function itemDetails(item: EconomyItem): Record<string, unknown> {
  return { itemId: item.id, code: item.code, name: item.name };
}

function categoryDetails(category: EconomyItemCategory): Record<string, unknown> {
  return { categoryId: category.id, code: category.code, name: category.name };
}
