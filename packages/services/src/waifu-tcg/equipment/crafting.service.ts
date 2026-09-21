import { DatabaseError } from '@ririko/core';
import {
  withTransaction,
  type DatabaseClient,
  type DungeonSeasonRepository,
  type EconomyRepository,
  type GameItem,
  type GameItemRepository,
  type UserDungeonProgressRepository,
  type UserInventoryItem,
  type UserInventoryItemRepository,
} from '@ririko/database';
import { CraftingIngredient, CraftingRecipe, CRAFTING_RECIPES, findCraftingRecipe } from './crafting-recipes.js';
import { ItemGrantService } from './item-grant.service.js';

/** Equipment/accessory recipes only ever produce one instance per craft() call. */
export const MAX_EQUIPMENT_CRAFT_QUANTITY = 1;
/** Consumable (potion) recipes may be batched up to this many per craft() call. */
export const MAX_CONSUMABLE_CRAFT_QUANTITY = 10;

export interface IngredientStatus {
  code: string;
  name: string;
  requiredPerCraft: number;
  owned: number;
  sufficient: boolean;
}

export interface RecipeStatus {
  recipe: CraftingRecipe;
  /** Catalog definition of the recipe's output. */
  outputItem: GameItem;
  unlocked: boolean;
  requiredFloor: number;
  userHighestFloor: number;
  ownedDust: number;
  ownedCredits: number;
  ingredients: IngredientStatus[];
  /** Unlocked, and the user can afford dust + credits + ingredients for one craft right now. */
  affordable: boolean;
}

export interface CraftReceipt {
  success: boolean;
  recipeCode: string;
  outputItem: GameItem;
  quantity: number;
  outputQuantity: number;
  dustSpent: number;
  creditsSpent: number;
  ingredientsSpent: { code: string; quantity: number }[];
  /** New inventory rows granted by this craft. */
  inventoryItemIds: string[];
  walletBalanceAfter: number;
}

/**
 * Crafts equipment, accessories and select potions out of Crafting Dust, credits, and (for
 * upgrade-path recipes) an owned lower-tier item of the same kind. See crafting-recipes.ts for
 * the recipe table and its pricing formula.
 */
export class CraftingService {
  private readonly grants: ItemGrantService;

  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly progressRepo: UserDungeonProgressRepository,
    private readonly seasonRepo: DungeonSeasonRepository,
    private readonly dbClient: DatabaseClient,
  ) {
    this.grants = new ItemGrantService(itemRepo, inventoryRepo);
  }

  /**
   * Highest floor the user has cleared in the current (non-tutorial) active season, or 0 when
   * there is no active season or no recorded progress yet.
   */
  async getHighestClearedFloor(userId: string, tx?: DatabaseClient): Promise<number> {
    const season = await this.seasonRepo.findActiveSeason(tx);
    if (!season) return 0;
    const progress = await this.progressRepo.findByUserAndSeason(userId, season.id, tx);
    return progress?.highestClearedFloor ?? 0;
  }

  /** Number of unequipped units of `code` the user owns (stacked count for materials/potions, row count for gear). */
  private async countUnequipped(userId: string, code: string, tx?: DatabaseClient): Promise<number> {
    const item = await this.itemRepo.findByCode(code, tx);
    if (!item) return 0;
    if (item.type === 'MATERIAL' || item.type === 'CONSUMABLE') {
      return this.grants.countOwned(userId, code, tx);
    }
    const rows = await this.inventoryRepo.findByUser(userId, { state: 'IDLE' }, tx);
    return rows.filter((row) => row.itemId === item.id).length;
  }

  /**
   * Consumes `quantity` of `code` from the user's UNEQUIPPED holdings. Stackable materials and
   * potions come off the IDLE stack; individual gear/accessory instances are removed lowest
   * enhancement level first, and EQUIPPED rows are never touched (they're excluded by the
   * `state: 'IDLE'` filter). Throws when the user does not hold enough.
   */
  private async consumeIngredient(
    userId: string,
    code: string,
    quantity: number,
    tx: DatabaseClient,
  ): Promise<void> {
    const item = await this.itemRepo.findByCode(code, tx);
    if (!item) throw new DatabaseError(`Unknown ingredient item: ${code}`);

    if (item.type === 'MATERIAL' || item.type === 'CONSUMABLE') {
      await this.grants.consume(userId, code, quantity, tx);
      return;
    }

    const owned = (await this.inventoryRepo.findByUser(userId, { state: 'IDLE' }, tx))
      .filter((row) => row.itemId === item.id)
      .sort((a, b) => a.enhancementLevel - b.enhancementLevel);

    if (owned.length < quantity) {
      throw new DatabaseError(
        `Not enough unequipped ${item.name}: need ${quantity}, have ${owned.length}.`,
      );
    }
    for (let i = 0; i < quantity; i++) {
      await this.inventoryRepo.delete(owned[i]!.id, tx);
    }
  }

  /**
   * Every recipe joined with catalog info and the user's current ability to craft it: locked
   * (with the floor still needed), dust/credits/ingredient shortfalls, or ready to craft.
   */
  async listRecipes(userId: string): Promise<RecipeStatus[]> {
    const userHighestFloor = await this.getHighestClearedFloor(userId);
    const ownedDust = await this.grants.countOwned(userId, 'CRAFTING_DUST');
    const balance = await this.economyRepo.findById(userId);
    const ownedCredits = balance ? Number(balance.walletBalance) : 0;

    const statuses: RecipeStatus[] = [];
    for (const recipe of CRAFTING_RECIPES) {
      const outputItem = await this.itemRepo.findByCode(recipe.outputCode);
      if (!outputItem) {
        throw new DatabaseError(
          `Crafting recipe ${recipe.code} references unknown catalog item ${recipe.outputCode}`,
        );
      }

      const unlocked = userHighestFloor >= recipe.unlockFloor;

      const ingredients: IngredientStatus[] = [];
      for (const ingredient of recipe.ingredients ?? []) {
        const ingredientItem = await this.itemRepo.findByCode(ingredient.code);
        const owned = await this.countUnequipped(userId, ingredient.code);
        ingredients.push({
          code: ingredient.code,
          name: ingredientItem?.name ?? ingredient.code,
          requiredPerCraft: ingredient.quantity,
          owned,
          sufficient: owned >= ingredient.quantity,
        });
      }

      const affordable =
        unlocked &&
        ownedDust >= recipe.dustCost &&
        ownedCredits >= recipe.creditCost &&
        ingredients.every((i) => i.sufficient);

      statuses.push({
        recipe,
        outputItem,
        unlocked,
        requiredFloor: recipe.unlockFloor,
        userHighestFloor,
        ownedDust,
        ownedCredits,
        ingredients,
        affordable,
      });
    }
    return statuses;
  }

  private maxQuantityFor(outputType: string): number {
    return outputType === 'EQUIPMENT' || outputType === 'ACCESSORY'
      ? MAX_EQUIPMENT_CRAFT_QUANTITY
      : MAX_CONSUMABLE_CRAFT_QUANTITY;
  }

  /**
   * Crafts `quantity` copies of a recipe's output, spending dust, credits and any ingredients,
   * then granting the output items. Equipment/accessory recipes only ever produce one instance
   * per call (each needs its own enhancement level); potions may be batched up to 10.
   *
   * Atomicity: the whole operation runs inside a single DB transaction (withTransaction, the
   * same primitive MarketService and EconomyRepository.modifyBalance use). Every balance/state
   * read used to decide the outcome is re-read from inside that transaction immediately before
   * it mutates, so a concurrent spend can't slip in between the check and the spend; if any step
   * throws (insufficient dust, credits, ingredients, or a grant failure), the whole transaction
   * rolls back and nothing is lost - there is no separate compensation step to write or forget.
   */
  async craft(userId: string, recipeCode: string, quantity = 1): Promise<CraftReceipt> {
    const recipe = findCraftingRecipe(recipeCode);
    if (!recipe) {
      throw new DatabaseError(`Unknown crafting recipe: ${recipeCode}`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DatabaseError('Craft quantity must be a positive integer');
    }

    const outputItem = await this.itemRepo.findByCode(recipe.outputCode);
    if (!outputItem) {
      throw new DatabaseError(
        `Crafting recipe ${recipe.code} references unknown catalog item ${recipe.outputCode}`,
      );
    }

    const maxQuantity = this.maxQuantityFor(outputItem.type);
    if (quantity > maxQuantity) {
      throw new DatabaseError(
        outputItem.type === 'EQUIPMENT' || outputItem.type === 'ACCESSORY'
          ? `${outputItem.name} can only be crafted one at a time`
          : `Craft quantity exceeds the per-order limit of ${maxQuantity}`,
      );
    }

    return withTransaction(this.dbClient, async (tx) => {
      const highestFloor = await this.getHighestClearedFloor(userId, tx);
      if (highestFloor < recipe.unlockFloor) {
        throw new DatabaseError(
          `${outputItem.name} is locked. Requires clearing floor ${recipe.unlockFloor} (highest cleared: ${highestFloor}).`,
        );
      }

      const totalDust = recipe.dustCost * quantity;
      const totalCredits = recipe.creditCost * quantity;

      const ownedDust = await this.grants.countOwned(userId, 'CRAFTING_DUST', tx);
      if (ownedDust < totalDust) {
        throw new DatabaseError(
          `Insufficient Crafting Dust! Required: ${totalDust} Dust, but you only have ${ownedDust} Dust.`,
        );
      }

      const balance = await this.economyRepo.findById(userId, tx);
      const ownedCredits = balance ? Number(balance.walletBalance) : 0;
      if (ownedCredits < totalCredits) {
        throw new DatabaseError(
          `Insufficient Credits! Required: ${totalCredits} Credits, but you only have ${ownedCredits} Credits.`,
        );
      }

      const scaledIngredients: CraftingIngredient[] = (recipe.ingredients ?? []).map((ingredient) => ({
        code: ingredient.code,
        quantity: ingredient.quantity * quantity,
      }));
      for (const ingredient of scaledIngredients) {
        const owned = await this.countUnequipped(userId, ingredient.code, tx);
        if (owned < ingredient.quantity) {
          const ingredientItem = await this.itemRepo.findByCode(ingredient.code, tx);
          throw new DatabaseError(
            `Not enough unequipped ${ingredientItem?.name ?? ingredient.code}: need ${ingredient.quantity}, have ${owned}.`,
          );
        }
      }

      // All checks passed - spend, in order, then grant. A throw at any point rolls the whole
      // transaction back, so partial spends can never be observed.
      if (totalDust > 0) {
        await this.grants.consume(userId, 'CRAFTING_DUST', totalDust, tx);
      }
      if (totalCredits > 0) {
        await this.economyRepo.modifyBalance(
          {
            userId,
            walletDelta: -totalCredits,
            type: 'CRAFTING',
            source: 'TCG_CRAFTING',
            metadata: { recipeCode: recipe.code, outputCode: recipe.outputCode, quantity },
          },
          tx,
        );
      }
      for (const ingredient of scaledIngredients) {
        await this.consumeIngredient(userId, ingredient.code, ingredient.quantity, tx);
      }

      const granted: UserInventoryItem[] = [];
      for (let i = 0; i < quantity; i++) {
        const result = await this.grants.grantItem(userId, outputItem, recipe.outputQuantity, 'CRAFTING', tx);
        granted.push(...result.inventoryItems);
      }

      const balanceAfter = await this.economyRepo.findById(userId, tx);

      return {
        success: true,
        recipeCode: recipe.code,
        outputItem,
        quantity,
        outputQuantity: recipe.outputQuantity * quantity,
        dustSpent: totalDust,
        creditsSpent: totalCredits,
        ingredientsSpent: scaledIngredients,
        inventoryItemIds: granted.map((row) => row.id),
        walletBalanceAfter: balanceAfter ? Number(balanceAfter.walletBalance) : 0,
      };
    });
  }
}
