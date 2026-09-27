import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AdventureSessionRepository,
  DatabaseClient,
  PlayerEnergyRepository,
} from '@ririko/database';
import type {
  ActiveAdventureSession,
  AdventureCardSnapshot,
  AdventureCost,
  AdventureSettlementReceipt,
  AdventureTransition,
} from './types.js';
import { getAdventureScenario, pickRandomScenario } from './scenarios/index.js';
import { adventureRandom } from './random.js';
import { accumulateAdventureEffects } from './reward-effects.js';
import {
  createRewardEconomy,
  balanceCompletionRewards,
  completionEffects,
} from './completion-rewards.js';
import {
  adventureRewardRank,
  newRewardCalculation,
  validateAdventureRewardState,
  finalizeRankRewards,
  emptyRankAmounts,
} from './reward-rank.js';

export const ADVENTURE_DECISION_MS = 90_000;
export const ADVENTURE_FALLBACK_MS = 15 * 60_000;

export class AdventureError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly session?: ActiveAdventureSession,
  ) {
    super(message);
    this.name = 'AdventureError';
  }
}

/** All callbacks execute inside the locked session transaction; implementations must use tx. */
export interface AdventurePaymentPort {
  payChoice(
    session: ActiveAdventureSession,
    cost: AdventureCost,
    tx: DatabaseClient,
  ): Promise<void>;
  prepareRewards(
    session: ActiveAdventureSession,
    random: () => number,
    tx: DatabaseClient,
  ): Promise<void>;
  settle(
    session: ActiveAdventureSession,
    tx: DatabaseClient,
    now: number,
  ): Promise<AdventureSettlementReceipt>;
}
export interface AdventureEngineOptions {
  /** Allows legacy-policy fixtures/workers during a controlled rollout. Defaults to enabled. */
  completionRewards?: boolean;
  sessions: AdventureSessionRepository<ActiveAdventureSession>;
  energy: PlayerEnergyRepository;
  payments: AdventurePaymentPort;
  now?: () => number;
  seed?: () => number;
  id?: () => string;
  startCooldownMs?: number;
}
export interface StartAdventureOptions {
  resolveCard?: (tx: DatabaseClient) => Promise<AdventureCardSnapshot | null>;
  userId: string;
  guildId: string;
  channelId: string;
  scenarioId?: string;
  card?: AdventureCardSnapshot | null;
}

export function resolveAdventureTransition(
  transition: AdventureTransition,
  card: AdventureCardSnapshot | null,
  random: () => number,
): string {
  if (transition.type === 'direct') return transition.target;
  if (transition.type === 'element')
    return card?.element === transition.element ? transition.success : transition.failure;
  if (transition.type === 'stat')
    return card !== null && card[transition.stat] >= transition.minimum
      ? transition.success
      : transition.failure;
  const chance = Math.max(
    0,
    Math.min(
      1,
      transition.chance +
        (transition.element && card?.element === transition.element
          ? (transition.elementBonus ?? 0.25)
          : 0),
    ),
  );
  return random() < chance ? transition.success : transition.failure;
}

export class AdventureEngine {
  private readonly now: () => number;
  private readonly seed: () => number;
  private readonly id: () => string;
  constructor(private readonly options: AdventureEngineOptions) {
    this.now = options.now ?? Date.now;
    this.seed = options.seed ?? (() => randomBytes(4).readUInt32LE());
    this.id = options.id ?? randomUUID;
  }

  /** Check every unfinished payload before gateway startup, without modifying legacy state. */
  async assertCompatibleSessions(): Promise<void> {
    let afterId = '';
    for (;;) {
      const batch = await this.options.sessions.listRecoverable(Number.MAX_SAFE_INTEGER, afterId);
      if (!batch.length) return;
      for (const session of batch) validateAdventureRewardState(session);
      afterId = batch.at(-1)!.id;
    }
  }

  async start(input: StartAdventureOptions): Promise<ActiveAdventureSession> {
    if (!input.userId || !input.guildId || !input.channelId)
      throw new AdventureError('INVALID_CONTEXT', 'Adventure requires a user, guild and channel.');
    // Resolve explicit IDs before charging anything. Random selection advances persisted RNG state.
    const explicit = input.scenarioId ? getAdventureScenario(input.scenarioId) : null;
    const result = await this.options.sessions.withUser(
      input.userId,
      async (tx, cooldownUntil, lastStartAt) => {
        const now = this.now();
        let active = await this.options.sessions.findActive(input.userId, tx);
        if (active?.status === 'ACTIVE' && active.deadline <= now) {
          const reason = this.timeoutStatus(active);
          await this.cancelLocked(active, reason, tx);
          if (reason === 'START_FAILED' && active.admissionMode === 'COOLDOWN') cooldownUntil = 0;
          active = null;
        }
        if (active)
          return {
            error: new AdventureError(
              'ALREADY_ACTIVE',
              'You already have an active adventure.',
              active,
            ),
          };
        if (cooldownUntil > now)
          return {
            error: new AdventureError(
              'COOLDOWN',
              `Your next adventure is available <t:${Math.ceil(cooldownUntil / 1000)}:R>.`,
            ),
          };
        const throttle = this.options.startCooldownMs ?? 10_000;
        if (lastStartAt && now - lastStartAt < throttle)
          return {
            error: new AdventureError(
              'START_COOLDOWN',
              'Please wait 10 seconds between adventure starts.',
            ),
          };
        const card = structuredClone(
          input.resolveCard ? await input.resolveCard(tx) : (input.card ?? null),
        );
        const rewardRank = adventureRewardRank(card ? card.level! : null, input.userId);
        await this.options.sessions.setLastStart(input.userId, now, tx);
        const { energyEnabled } = await this.options.sessions.getSettings(input.guildId, tx);
        if (energyEnabled) {
          const charge = await this.options.energy.consumeEnergy(input.userId, 15, tx);
          if (!charge.success)
            return { error: new AdventureError('ENERGY', charge.reason ?? 'You need 15 energy.') };
        } else
          await this.options.sessions.setCooldown(input.userId, now + ADVENTURE_FALLBACK_MS, tx);
        const cursor = { rngState: this.seed() >>> 0 };
        const scenario = explicit ?? pickRandomScenario(adventureRandom(cursor));
        const session: ActiveAdventureSession = {
          id: this.id(),
          userId: input.userId,
          guildId: input.guildId,
          channelId: input.channelId,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          currentNodeId: scenario.rootNodeId,
          revision: 0,
          status: 'ACTIVE',
          rngState: cursor.rngState,
          card,
          rewardRank,
          ...(this.options.completionRewards === false
            ? {}
            : { rewardEconomy: createRewardEconomy(scenario, card, energyEnabled) }),
          rewardCalculation: newRewardCalculation(),
          admissionMode: energyEnabled ? 'ENERGY' : 'COOLDOWN',
          entryEnergyCharged: energyEnabled ? 15 : 0,
          startedAt: now,
          deadline: now + ADVENTURE_DECISION_MS,
          presented: false,
          messageId: null,
          deliveredRevision: -1,
          rewards: { credits: '0', xp: 0, dust: 0, energy: 0, items: [], cards: [] },
          penalties: { credits: '0', energy: 0 },
          history: [],
          receipt: null,
        };
        await this.options.sessions.create(session, tx);
        return { session };
      },
    );
    if (result.error) throw result.error;
    return result.session!;
  }

  /** Presentation changes no decision revision and cannot extend an already presented deadline. */
  async presented(
    userId: string,
    sessionId: string,
    revision: number,
    messageId: string,
  ): Promise<ActiveAdventureSession> {
    return this.options.sessions.withUser(userId, async (tx) => {
      const session = await this.owned(userId, sessionId, tx);
      if (session.revision !== revision) return session;
      if (session.status !== 'ACTIVE') {
        session.messageId = messageId;
        session.deliveredRevision = revision;
        await this.options.sessions.save(session, revision, tx);
        return session;
      }
      session.messageId = messageId;
      if (session.deadline <= this.now())
        return this.cancelLocked(session, this.timeoutStatus(session), tx);
      if (!session.presented) {
        session.presented = true;
        session.messageId = messageId;
        session.deadline = this.now() + ADVENTURE_DECISION_MS;
      }
      session.messageId = messageId;
      session.deliveredRevision = revision;
      await this.options.sessions.save(session, revision, tx);
      return session;
    });
  }

  async choose(
    userId: string,
    sessionId: string,
    revision: number,
    choiceId: string,
  ): Promise<ActiveAdventureSession> {
    return this.options.sessions.withUser(userId, async (tx) => {
      const session = await this.owned(userId, sessionId, tx);
      // A retried accepted action returns current state without consuming money/RNG again.
      if (
        session.history.some(
          (receipt) => receipt.revision === revision && receipt.choiceId === choiceId,
        )
      )
        return session;
      if (session.status !== 'ACTIVE' || session.revision !== revision)
        throw new AdventureError('STALE', 'That decision has already ended.', session);
      if (session.deadline <= this.now())
        return this.cancelLocked(session, this.timeoutStatus(session), tx);
      if (!session.presented)
        throw new AdventureError('NOT_PRESENTED', 'This decision is not ready yet.', session);
      const scenario = getAdventureScenario(session.scenarioId, session.scenarioVersion);
      const node = scenario.nodes[session.currentNodeId];
      if (node?.type !== 'decision') throw new Error('Expected adventure decision');
      const choice = node.choices.find((value) => value.id === choiceId);
      if (!choice) throw new AdventureError('CHOICE', 'Unknown adventure choice.');
      if (choice.cost) await this.options.payments.payChoice(session, choice.cost, tx);
      const random = adventureRandom(session);
      const nextId = resolveAdventureTransition(choice.transition, session.card, random);
      accumulateAdventureEffects(session, choice.effects, random);
      const next = scenario.nodes[nextId];
      if (!next) throw new Error('Missing adventure node');
      if (next.type === 'terminal') {
        accumulateAdventureEffects(
          session,
          completionEffects(
            session,
            choice.terminalRankScaling
              ? {
                  ...next.outcome,
                  rewards: { ...next.outcome.rewards, rankScaling: choice.terminalRankScaling },
                }
              : next.outcome,
          ),
          random,
        );
        balanceCompletionRewards(session, next.outcome.type);
        finalizeRankRewards(session);
        await this.options.payments.prepareRewards(session, random, tx);
        session.status = 'SETTLING';
      }
      const receipt = {
        revision,
        nodeId: node.id,
        choiceId,
        label: choice.label,
        nextNodeId: nextId,
        paidCredits: String(choice.cost?.credits ?? 0),
        paidItems: structuredClone(choice.cost?.items ?? []),
        acceptedAt: this.now(),
      };
      session.history.push(receipt);
      session.currentNodeId = nextId;
      session.revision++;
      session.presented = false;
      session.deadline = this.now() + ADVENTURE_DECISION_MS;
      await this.options.sessions.recordChoice(session.id, revision, receipt, tx);
      await this.options.sessions.save(session, revision, tx);
      return session;
    });
  }

  async settle(userId: string, sessionId: string): Promise<ActiveAdventureSession> {
    return this.options.sessions.withUser(userId, async (tx) => {
      const session = await this.owned(userId, sessionId, tx);
      if (session.receipt) return session;
      if (session.status !== 'SETTLING')
        throw new AdventureError('NOT_FINISHED', 'Your adventure has not reached its ending.');
      const receipt = await this.options.payments.settle(session, tx, this.now());
      if (receipt.status !== 'COMPLETED') throw new Error('Invalid completion receipt');
      const revision = session.revision;
      session.receipt = receipt;
      session.status = 'COMPLETED';
      session.revision++;
      await this.options.sessions.save(session, revision, tx);
      return session;
    });
  }

  async cancel(
    userId: string,
    sessionId: string,
    reason: 'ABANDONED' | 'START_FAILED' = 'ABANDONED',
    expectedRevision?: number,
  ): Promise<ActiveAdventureSession> {
    return this.options.sessions.withUser(userId, async (tx) => {
      const session = await this.owned(userId, sessionId, tx);
      if (session.receipt) return session;
      if (session.status !== 'ACTIVE')
        throw new AdventureError(
          'SETTLING',
          'Your rewards are being settled. Please check status shortly.',
          session,
        );
      if (expectedRevision !== undefined && session.revision !== expectedRevision)
        throw new AdventureError('STALE', 'That decision has already ended.', session);
      if (reason === 'START_FAILED' && (session.presented || session.history.length))
        throw new AdventureError('ALREADY_STARTED', 'This adventure has already started.');
      return this.cancelLocked(session, reason, tx);
    });
  }

  async status(userId: string): Promise<ActiveAdventureSession | null> {
    return this.options.sessions.withUser(userId, async (tx) => {
      const session =
        (await this.options.sessions.findActive(userId, tx)) ??
        (await this.options.sessions.findLatest(userId, tx));
      if (session) validateAdventureRewardState(session);
      if (session?.status === 'ACTIVE' && session.deadline <= this.now())
        return this.cancelLocked(session, this.timeoutStatus(session), tx);
      return session;
    });
  }

  /** Called on startup and by the bot recovery scheduler; one broken run cannot starve others. */
  async recover(
    onResult: (session: ActiveAdventureSession) => Promise<void>,
    onError: (error: unknown, session: ActiveAdventureSession) => void,
  ): Promise<void> {
    let afterId = '';
    for (;;) {
      const batch = await this.options.sessions.listRecoverable(this.now(), afterId);
      if (!batch.length) return;
      for (const stored of batch) {
        try {
          const session =
            stored.status === 'SETTLING'
              ? await this.settle(stored.userId, stored.id)
              : await this.options.sessions.withUser(stored.userId, async (tx) => {
                  const current = await this.owned(stored.userId, stored.id, tx);
                  return current.status === 'ACTIVE' && current.deadline <= this.now()
                    ? this.cancelLocked(current, this.timeoutStatus(current), tx)
                    : current;
                });
          if (session.receipt) await onResult(session);
        } catch (error) {
          onError(error, stored);
        }
      }
      afterId = batch.at(-1)!.id;
    }
  }

  private async owned(
    userId: string,
    id: string,
    tx: DatabaseClient,
  ): Promise<ActiveAdventureSession> {
    const session = await this.options.sessions.findById(id, tx);
    if (!session || session.userId !== userId)
      throw new AdventureError(
        'OWNER',
        'This adventure belongs to another player or no longer exists.',
      );
    validateAdventureRewardState(session);
    return session;
  }
  private timeoutStatus(session: ActiveAdventureSession): 'START_FAILED' | 'TIMED_OUT' {
    return !session.presented && session.history.length === 0 ? 'START_FAILED' : 'TIMED_OUT';
  }
  private async cancelLocked(
    session: ActiveAdventureSession,
    reason: 'ABANDONED' | 'TIMED_OUT' | 'START_FAILED',
    tx: DatabaseClient,
  ): Promise<ActiveAdventureSession> {
    validateAdventureRewardState(session);
    let refunded = 0;
    if (session.entryEnergyCharged > 0) {
      const energy = await this.options.energy.getForUpdate(session.userId, tx);
      refunded = Math.min(
        reason === 'START_FAILED'
          ? session.entryEnergyCharged
          : Math.floor(session.entryEnergyCharged / 2),
        Math.max(0, energy.maxEnergy + energy.bonusEnergy - energy.currentEnergy),
      );
      if (refunded)
        await this.options.energy.update(
          session.userId,
          { currentEnergy: energy.currentEnergy + refunded },
          tx,
        );
    }
    if (reason === 'START_FAILED' && session.admissionMode === 'COOLDOWN')
      await this.options.sessions.setCooldown(session.userId, 0, tx);
    const paid = session.history.reduce(
      (total, receipt) => total + BigInt(receipt.paidCredits),
      0n,
    );
    session.receipt = {
      ...(session.rewardRank
        ? { rewardRank: structuredClone(session.rewardRank), rewardBonus: emptyRankAmounts() }
        : {}),
      status: reason,
      grossCredits: '0',
      lostCredits: '0',
      paidCredits: paid.toString(),
      netCredits: (-paid).toString(),
      xp: 0,
      dust: 0,
      energyChange: refunded,
      items: [],
      cards: [],
      unavailableCards: 0,
      settledAt: this.now(),
    };
    const revision = session.revision;
    session.status = reason;
    session.revision++;
    await this.options.sessions.save(session, revision, tx);
    return session;
  }
}
