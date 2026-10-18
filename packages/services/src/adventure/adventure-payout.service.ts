import type {
  DatabaseClient,
  EconomyRepository,
  XpRepository,
  PlayerEnergyRepository,
  WaifuCardRepository,
  WaifuAssetRepository,
  WaifuCard,
} from '@ririko/database';
import { LevelingService } from '../economy/leveling.service.js';
import type { ItemGrantService } from '../waifu-tcg/equipment/item-grant.service.js';
import { RARITY_TIERS, ORDERED_RARITY_TIERS } from '../waifu-tcg/rarity/rarity-engine.js';
import type { CardRarity } from '../waifu-tcg/types.js';
import { AdventureError, type AdventurePaymentPort } from './adventure-engine.js';
import type { ActiveAdventureSession, AdventureCost, AdventureSettlementReceipt } from './types.js';
import { adventureRewardBonus, validateAdventureRewardState } from './reward-rank.js';
import { CardProgressionService } from '../waifu-tcg/card/card-progression.service.js';

export interface AdventurePayoutOptions {
  economy: EconomyRepository;
  xp: XpRepository;
  energy: PlayerEnergyRepository;
  cards: WaifuCardRepository;
  assets: WaifuAssetRepository;
  items: ItemGrantService;
}

/** Invoked only inside the engine's locked transaction, including every inventory/ledger write. */
export class AdventurePayoutService implements AdventurePaymentPort {
  constructor(private readonly options: AdventurePayoutOptions) {}

  async payChoice(
    session: ActiveAdventureSession,
    cost: AdventureCost,
    tx: DatabaseClient,
  ): Promise<void> {
    if (cost.credits) {
      const balance = await this.options.economy.getBalanceForUpdate(session.userId, tx);
      if (BigInt(balance.walletBalance) < BigInt(cost.credits))
        throw new AdventureError(
          'INSUFFICIENT_CREDITS',
          `This choice costs ${cost.credits} credits. Choose another route.`,
        );
      await this.money(session, -BigInt(cost.credits), 'ADVENTURE_COST', tx);
    }
    for (const item of cost.items ?? []) {
      // consume rechecks under the shared inventory lock; failure rolls the whole choice back.
      await this.options.items.consume(session.userId, item.code, item.quantity, tx);
    }
  }

  async prepareRewards(
    session: ActiveAdventureSession,
    random: () => number,
    tx: DatabaseClient,
  ): Promise<void> {
    const pool = new Map<CardRarity, WaifuCard[]>();
    for (const intent of session.rewards.cards) {
      const tiers = ORDERED_RARITY_TIERS.slice(
        0,
        ORDERED_RARITY_TIERS.indexOf(intent.minRarity) + 1,
      );
      for (const rarity of tiers) {
        if (pool.has(rarity)) continue;
        const eligible: WaifuCard[] = [];
        for (let offset = 0; ; offset += 100) {
          const page = await this.options.cards.listCards(
            { rarity, isActive: true, limit: 100, offset },
            tx,
          );
          for (const card of page) {
            if (await this.usable(card, intent.minRarity, tx)) eligible.push(card);
          }
          if (page.length < 100) break;
        }
        pool.set(rarity, eligible);
      }
      const available = tiers.filter((tier) => pool.get(tier)!.length > 0);
      if (!available.length) {
        intent.cardId = null;
        continue;
      }
      const totalWeight = available.reduce((sum, tier) => sum + RARITY_TIERS[tier].weight, 0);
      let roll = random() * totalWeight;
      let selected = available[available.length - 1]!;
      for (const tier of available) {
        roll -= RARITY_TIERS[tier].weight;
        if (roll < 0) {
          selected = tier;
          break;
        }
      }
      const candidates = pool.get(selected)!;
      intent.cardId = candidates[Math.floor(random() * candidates.length)]!.id;
    }
  }

  async settle(
    session: ActiveAdventureSession,
    tx: DatabaseClient,
    now: number,
  ): Promise<AdventureSettlementReceipt> {
    validateAdventureRewardState(session);
    const { economy, xp, energy, items, cards } = this.options;
    const balance = await economy.getBalanceForUpdate(session.userId, tx);
    const loss = BigInt(session.penalties.credits);
    const wallet = BigInt(balance.walletBalance);
    const actualLoss = loss < wallet ? loss : wallet;
    const gross = BigInt(session.rewards.credits);
    // Losses can consume only funds present before this settlement, never its new rewards.
    if (actualLoss > 0n) await this.money(session, -actualLoss, 'ADVENTURE_LOSS', tx);
    if (gross > 0n) await this.money(session, gross, 'ADVENTURE_REWARD', tx);
    if (session.rewards.xp) {
      const account = await xp.getAccountForUpdate(session.userId, session.guildId, tx);
      const total = Number(account.xp) + session.rewards.xp;
      if (!Number.isSafeInteger(total))
        throw new Error('Adventure XP exceeds the supported integer range.');
      const level = new LevelingService({ xpRepository: xp }).getLevelProgress(total).level;
      await xp.addXp(
        {
          userId: session.userId,
          guildId: session.guildId,
          xpDelta: session.rewards.xp,
          newLevel: level,
          source: 'adventure',
        },
        tx,
      );
    }
    const grants = [...session.rewards.items];
    if (session.rewards.dust)
      grants.push({ code: 'CRAFTING_DUST', quantity: session.rewards.dust });
    for (const grant of grants) {
      if (!(await items.grant(session.userId, grant.code, grant.quantity, 'ADVENTURE', tx)))
        throw new Error(`Adventure reward item is missing from the catalog: ${grant.code}`);
    }
    const awarded: AdventureSettlementReceipt['cards'] = [];
    let unavailableCards = 0;
    // Consistent card lock order avoids deadlocks when two payouts mint multiple definitions.
    for (const intent of [...session.rewards.cards].sort((a, b) =>
      (a.cardId ?? '').localeCompare(b.cardId ?? ''),
    )) {
      const definition = intent.cardId ? await cards.findById(intent.cardId, tx) : null;
      if (!definition || !(await this.usable(definition, intent.minRarity, tx))) {
        unavailableCards++;
        continue;
      }
      const owned = await cards.mintUserCard({ userId: session.userId, cardId: definition.id }, tx);
      awarded.push({
        id: owned.id,
        name: definition.name,
        rarity: definition.rarity as CardRarity,
        serial: owned.serialNumber,
      });
    }
    let energyChange = 0;
    if (
      session.admissionMode === 'ENERGY' &&
      (session.rewards.energy || session.penalties.energy)
    ) {
      const current = await energy.getForUpdate(session.userId, tx);
      const afterLoss = Math.max(0, current.currentEnergy - session.penalties.energy);
      const restored = Math.min(
        session.rewards.energy,
        Math.max(0, current.maxEnergy + current.bonusEnergy - afterLoss),
      );
      const after = afterLoss + restored;
      energyChange = after - current.currentEnergy;
      await energy.update(session.userId, { currentEnergy: after }, tx);
    }
    const paid = session.history.reduce((sum, step) => sum + BigInt(step.paidCredits), 0n);
    const companionXp =
      session.rewardEconomy && session.card?.userCardId && session.rewards.companionXp
        ? await new CardProgressionService(cards).grantExp(
            session.card.userCardId,
            session.rewards.companionXp,
            tx,
            session.userId,
          )
        : null;
    return {
      ...(session.rewardEconomy
        ? {
            economyVersion: 2 as const,
            ...(companionXp
              ? { companionXp }
              : session.rewards.companionXp
                ? { companionXpUnavailable: true }
                : {}),
          }
        : {}),
      ...(session.rewardRank
        ? {
            rewardRank: structuredClone(session.rewardRank),
            rewardBonus: adventureRewardBonus(session),
          }
        : {}),
      status: 'COMPLETED',
      grossCredits: gross.toString(),
      lostCredits: actualLoss.toString(),
      paidCredits: paid.toString(),
      netCredits: (gross - actualLoss - paid).toString(),
      xp: session.rewards.xp,
      dust: session.rewards.dust,
      energyChange,
      items: session.rewards.items,
      cards: awarded,
      unavailableCards,
      settledAt: now,
    };
  }

  private async usable(card: WaifuCard, floor: CardRarity, tx: DatabaseClient): Promise<boolean> {
    const rank = ORDERED_RARITY_TIERS.indexOf(card.rarity as CardRarity);
    if (!card.isActive || rank < 0 || rank > ORDERED_RARITY_TIERS.indexOf(floor)) return false;
    const asset = await this.options.assets.findById(card.assetId, tx);
    return (
      asset !== null &&
      !asset.isDeletedByRequest &&
      Boolean(asset.localStoragePath || asset.discordCdnUrl)
    );
  }

  private async money(
    session: ActiveAdventureSession,
    delta: bigint,
    type: string,
    tx: DatabaseClient,
  ): Promise<void> {
    if (tx.dialect === 'sqlite') {
      const balance = await this.options.economy.getBalanceForUpdate(session.userId, tx);
      const safe = [balance.walletBalance, balance.bankBalance].every(Number.isSafeInteger);
      const total = BigInt(balance.walletBalance) + BigInt(balance.bankBalance) + delta;
      if (!safe || total > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Adventure balance exceeds the supported SQLite integer range.');
    }
    await this.options.economy.modifyBalance(
      {
        userId: session.userId,
        guildId: session.guildId,
        walletDelta: delta,
        type,
        source: 'adventure',
        metadata: { sessionId: session.id, revision: session.revision },
      },
      tx,
    );
  }
}
