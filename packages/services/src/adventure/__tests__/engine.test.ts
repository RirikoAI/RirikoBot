import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseClient,
  AdventureSessionRepository,
  PlayerEnergyRepository,
  EconomyRepository,
  ensureAdventureSchema,
} from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import {
  AdventureEngine,
  ADVENTURE_DECISION_MS,
  ADVENTURE_FALLBACK_MS,
  resolveAdventureTransition,
} from '../adventure-engine.js';
import type { AdventurePaymentPort } from '../adventure-engine.js';
import type { ActiveAdventureSession, AdventureCardSnapshot } from '../types.js';
import { adventureRandom } from '../random.js';

describe('durable adventure engine', () => {
  let db: SqliteDatabaseClient;
  let sessions: AdventureSessionRepository<ActiveAdventureSession>;
  let energy: PlayerEnergyRepository;
  let economy: EconomyRepository;
  let payments: AdventurePaymentPort;
  let engine: AdventureEngine;
  let now: number;
  let nextId: number;
  const input = {
    userId: 'alice',
    guildId: 'guild-a',
    channelId: 'channel-a',
    scenarioId: 'the-goblin-bazaar',
  };
  beforeEach(async () => {
    db = (await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    })) as SqliteDatabaseClient;
    sessions = new AdventureSessionRepository(db);
    energy = new PlayerEnergyRepository(db);
    economy = new EconomyRepository(db);
    now = 1_000_000;
    nextId = 0;
    payments = {
      payChoice: vi.fn<AdventurePaymentPort['payChoice']>(async (session, cost, tx) => {
        if (cost.credits)
          await economy.modifyBalance(
            {
              userId: session.userId,
              walletDelta: -cost.credits,
              type: 'ADVENTURE_COST',
              source: session.id,
            },
            tx,
          );
      }),
      prepareRewards: vi.fn<AdventurePaymentPort['prepareRewards']>(async () => {}),
      settle: vi.fn<AdventurePaymentPort['settle']>(async (session, tx, settledAt) => {
        await economy.modifyBalance(
          {
            userId: session.userId,
            walletDelta: BigInt(session.rewards.credits),
            type: 'ADVENTURE_REWARD',
            source: session.id,
          },
          tx,
        );
        const paid = session.history.reduce(
          (total, receipt) => total + BigInt(receipt.paidCredits),
          0n,
        );
        return {
          status: 'COMPLETED',
          grossCredits: session.rewards.credits,
          lostCredits: '0',
          paidCredits: paid.toString(),
          netCredits: (BigInt(session.rewards.credits) - paid).toString(),
          xp: 0,
          dust: 0,
          energyChange: 0,
          items: [],
          cards: [],
          unavailableCards: 0,
          settledAt,
        };
      }),
    };
    engine = makeEngine();
  });
  afterEach(async () => {
    await db.close();
  });
  function makeEngine(repo = sessions): AdventureEngine {
    return new AdventureEngine({
      completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
      startCooldownMs: 0,
      sessions: repo,
      energy,
      payments,
      now: () => now,
      seed: () => 1702,
      id: () => `session-${++nextId}`,
    });
  }
  async function present(session: ActiveAdventureSession) {
    return engine.presented(
      session.userId,
      session.id,
      session.revision,
      `message-${session.revision}`,
    );
  }
  async function choose(session: ActiveAdventureSession, choice: string) {
    await present(session);
    return engine.choose(session.userId, session.id, session.revision, choice);
  }

  it('migrates existing databases idempotently without dropping user data', async () => {
    await energy.getOrCreate('alice');
    await ensureAdventureSchema(db);
    await ensureAdventureSchema(db);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(100);
    expect((await engine.start(input)).status).toBe('ACTIVE');
  });
  it('admits only one concurrent global session across engines, guilds and channels', async () => {
    const other = makeEngine(new AdventureSessionRepository(db));
    const results = await Promise.allSettled([
      engine.start(input),
      other.start({ ...input, guildId: 'guild-b', channelId: 'channel-b' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
    expect((await other.start({ ...input, userId: 'bob' })).userId).toBe('bob');
  });
  it.each([0, 1, 14])(
    'rejects %i energy without fallback or a live session',
    async (currentEnergy) => {
      await energy.getOrCreate('alice');
      await energy.update('alice', { currentEnergy });
      await expect(engine.start(input)).rejects.toMatchObject({ code: 'ENERGY' });
      expect(await sessions.findActive('alice')).toBeNull();
      expect((await energy.findById('alice'))?.currentEnergy).toBe(currentEnergy);
      expect(await sessions.withUser('alice', async (_tx, deadline) => deadline)).toBe(0);
    },
  );
  it('accepts exactly 15 energy and snapshots card stats', async () => {
    await energy.getOrCreate('alice');
    await energy.update('alice', { currentEnergy: 15 });
    const card: AdventureCardSnapshot = {
      name: 'Rem',
      level: 1,
      element: 'WATER',
      attack: 100,
      defense: 100,
      speed: 50,
    };
    const session = await engine.start({ ...input, card });
    card.speed = 9999;
    expect((await energy.findById('alice'))?.currentEnergy).toBe(0);
    expect((await sessions.findById(session.id))?.card?.speed).toBe(50);
  });
  it('retains global fallback cooldown across cancellation, restart and guild changes', async () => {
    await sessions.setSettings('guild-a', { energyEnabled: false });
    const session = await engine.start(input);
    expect(session.entryEnergyCharged).toBe(0);
    await engine.cancel('alice', session.id);
    await expect(makeEngine().start({ ...input, guildId: 'guild-b' })).rejects.toMatchObject({
      code: 'COOLDOWN',
    });
    expect(await energy.findById('alice')).toBeNull();
    now += ADVENTURE_FALLBACK_MS;
    expect((await makeEngine().start({ ...input, guildId: 'guild-b' })).admissionMode).toBe(
      'ENERGY',
    );
  });
  it('compensates only unpublished initial admission and preserves potion counters', async () => {
    let session = await engine.start(input);
    await energy.update('alice', { dailyEnergyPotsUsed: 2 });
    await engine.cancel('alice', session.id, 'START_FAILED');
    expect((await energy.findById('alice'))?.currentEnergy).toBe(100);
    expect((await energy.findById('alice'))?.dailyEnergyPotsUsed).toBe(2);
    await sessions.setSettings('guild-a', { energyEnabled: false });
    session = await engine.start(input);
    await engine.cancel('alice', session.id, 'START_FAILED');
    session = await engine.start(input);
    await present(session);
    await expect(engine.cancel('alice', session.id, 'START_FAILED')).rejects.toMatchObject({
      code: 'ALREADY_STARTED',
    });
  });
  it('refunds seven once on timeout, without extension from duplicate presentation', async () => {
    const session = await engine.start(input);
    await present(session);
    now += 50_000;
    await present(session);
    now += 40_000;
    const expired = await engine.status('alice');
    expect(expired?.status).toBe('TIMED_OUT');
    expect(expired?.receipt?.energyChange).toBe(7);
    await engine.cancel('alice', session.id);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(92);
  });
  it('caps cancellation refunds and ignores mid-session setting changes', async () => {
    const session = await engine.start(input);
    await present(session);
    await sessions.setSettings('guild-a', { energyEnabled: false });
    await energy.update('alice', { currentEnergy: 98 });
    const result = await engine.cancel('alice', session.id);
    expect(result.receipt?.energyChange).toBe(2);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(100);
  });
  it('rejects other owners, stale choices and insufficient money without changing RNG/deadline', async () => {
    let session = await engine.start(input);
    session = await present(session);
    await expect(engine.choose('bob', session.id, 0, '1')).rejects.toMatchObject({ code: 'OWNER' });
    await expect(engine.choose('alice', session.id, 0, '1')).rejects.toThrow();
    expect(await sessions.findById(session.id)).toEqual(session);
    session = await engine.choose('alice', session.id, 0, '3');
    await expect(engine.choose('alice', session.id, 0, '2')).rejects.toMatchObject({
      code: 'STALE',
    });
  });
  it('charges a duplicated paid choice only once and retains the cost after abandonment', async () => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 100,
      type: 'TEST',
      source: 'TEST',
    });
    const start = await engine.start(input);
    await present(start);
    const results = await Promise.all([
      engine.choose('alice', start.id, 0, '1'),
      engine.choose('alice', start.id, 0, '1'),
    ]);
    expect(results[0]?.history).toHaveLength(1);
    expect(results[1]?.history).toHaveLength(1);
    expect(payments.payChoice).toHaveBeenCalledTimes(1);
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(50);
    const ended = await engine.cancel('alice', start.id);
    expect(ended.receipt?.netCredits).toBe('-50');
    expect(db.raw.prepare('SELECT count(*) AS n FROM adventure_choices').get()).toEqual({ n: 1 });
  });
  it('freezes the final result and settles exactly once after a worker restarts', async () => {
    let session = await engine.start(input);
    for (const choice of ['3', '2', '2', '1', '1']) session = await choose(session, choice);
    expect(session.status).toBe('SETTLING');
    expect(session.history).toHaveLength(5);
    expect(session.rewards.credits).toBe('300');
    await expect(engine.cancel('alice', session.id)).rejects.toMatchObject({ code: 'SETTLING' });
    const restarted = makeEngine();
    const [a, b] = await Promise.all([
      restarted.settle('alice', session.id),
      engine.settle('alice', session.id),
    ]);
    expect(a.receipt).toEqual(b.receipt);
    expect(payments.settle).toHaveBeenCalledTimes(1);
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(300);
  });
  it('freezes a level-100 rank at admission and never rescales on retry or restart', async () => {
    const card: AdventureCardSnapshot = {
      name: 'Rem (Lv.1)',
      level: 100,
      userCardId: 'owned',
      element: 'WATER',
      attack: 100,
      defense: 100,
      speed: 50,
    };
    const resolveCard = vi.fn(async () => card);
    let session = await engine.start({ ...input, resolveCard });
    card.level = 1;
    expect(resolveCard).toHaveBeenCalledOnce();
    expect(session.rewardRank).toMatchObject({ rank: 'S+', companionLevel: 100, amountBps: 60000 });
    for (const choice of ['3', '2', '2', '1', '1']) session = await choose(session, choice);
    expect(session.rewards.credits).toBe('1800');
    expect(session.rewards.dust).toBe(300);
    expect(session.rewardCalculation?.eligible.credits).toBe('300');
    const duplicate = await engine.choose('alice', session.id, 4, '1');
    expect(duplicate.rewards).toEqual(session.rewards);
    const restarted = makeEngine();
    await restarted.assertCompatibleSessions();
    const [a, b] = await Promise.all([
      restarted.settle('alice', session.id),
      engine.settle('alice', session.id),
    ]);
    expect(a.receipt).toEqual(b.receipt);
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(1800);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
  });
  it.each([
    [null, 'F', 10000, '300'],
    [1, 'F', 10000, '300'],
    [18, 'E', 15000, '450'],
    [100, 'S+', 60000, '1800'],
  ] as const)(
    'uses level-based rank for the formerly overridden user at level %s',
    async (level, rank, bps, credits) => {
      const userId = '391220345769689090';
      const card: AdventureCardSnapshot | null =
        level === null
          ? null
          : {
              name: 'Rem',
              level,
              element: 'WATER',
              attack: 100,
              defense: 100,
              speed: 50,
            };
      let session = await engine.start({ ...input, userId, card });
      expect(session.rewardRank).toMatchObject({
        rank,
        companionLevel: level,
        amountBps: bps,
        chanceBps: bps,
      });
      for (const choice of ['3', '2', '2', '1', '1']) session = await choose(session, choice);
      const done = await makeEngine().settle(userId, session.id);
      expect(done.rewards.credits).toBe(credits);
      expect((await sessions.findById(session.id))?.rewardRank?.rank).toBe(rank);
      const ordinary = await engine.start({ ...input, userId: '391220345769689091', card });
      expect(ordinary.rewardRank).toEqual(session.rewardRank);
    },
  );
  it('boosts actual card rolls without changing checks, rarity floors or RNG draws', async () => {
    const results: ActiveAdventureSession[] = [];
    for (const level of [1, 100]) {
      const seeded = new AdventureEngine({
        completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
        sessions,
        energy,
        payments,
        seed: () => 11,
        id: () => `drop-${level}`,
        now: () => now,
      });
      let state = await seeded.start({
        ...input,
        userId: `drop-${level}`,
        scenarioId: 'the-ember-forge',
        card: { name: 'Rem', level, element: 'WATER', attack: 100, defense: 100, speed: 50 },
      });
      for (const choice of ['2', '1', '1', '2']) {
        await seeded.presented(state.userId, state.id, state.revision, 'message');
        state = await seeded.choose(state.userId, state.id, state.revision, choice);
      }
      expect(state.currentNodeId).toBe('masterpiece');
      results.push(state);
    }
    expect(results[0]!.rewards.cards).toEqual([]);
    expect(results[1]!.rewards.cards).toEqual([{ minRarity: 'RARE', cardId: null }]);
    expect(results[0]!.rngState).toBe(results[1]!.rngState);
  });
  it.each([
    ['1', '400'],
    ['2', '300'],
  ] as const)('does not boost wager payout/exchange %s', async (finalChoice, gross) => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 1000,
      type: 'TEST',
      source: 'TEST',
    });
    const seeded = new AdventureEngine({
      completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
      sessions,
      energy,
      payments,
      seed: () => 7,
      id: () => `wager-${finalChoice}`,
      now: () => now,
    });
    let state = await seeded.start({
      ...input,
      card: { name: 'Rem', level: 100, element: 'WATER', attack: 100, defense: 100, speed: 50 },
    });
    for (const choice of ['1', '3', '1', '1', finalChoice]) {
      await seeded.presented('alice', state.id, state.revision, 'message');
      state = await seeded.choose('alice', state.id, state.revision, choice);
    }
    expect(['jackpot', 'clean']).toContain(state.currentNodeId);
    expect(state.rewards.credits).toBe(gross);
    expect(state.rewardCalculation?.eligible.credits).toBe('0');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(750);
  });
  it('keeps old ACTIVE and SETTLING payloads unboosted and completed receipts immutable', async () => {
    let session = await engine.start(input);
    delete session.rewardRank;
    delete session.rewardCalculation;
    await sessions.withUser('alice', (tx) => sessions.save(session, session.revision, tx));
    for (const choice of ['3', '2', '2', '1', '1']) session = await choose(session, choice);
    expect(session.rewards.credits).toBe('300');
    expect(session.rewardRank).toBeUndefined();
    await makeEngine().assertCompatibleSessions();
    const done = await makeEngine().settle('alice', session.id);
    expect((await makeEngine().settle('alice', session.id)).receipt).toEqual(done.receipt);
  });
  it('rejects invalid new companion levels before charging and unsupported saved policies before recovery', async () => {
    await energy.getOrCreate('alice');
    const card: AdventureCardSnapshot = {
      name: 'Level 100',
      level: 0,
      element: 'FIRE',
      attack: 1,
      defense: 1,
      speed: 1,
    };
    await expect(engine.start({ ...input, card })).rejects.toThrow('companion level');
    expect((await energy.findById('alice'))?.currentEnergy).toBe(100);
    expect(await sessions.findActive('alice')).toBeNull();
    const session = await engine.start(input);
    session.rewardRank!.policyVersion = 2 as 1;
    await sessions.withUser('alice', (tx) => sessions.save(session, session.revision, tx));
    await expect(makeEngine().assertCompatibleSessions()).rejects.toThrow('Unsupported');
    await expect(engine.cancel('alice', session.id)).rejects.toThrow('Unsupported');
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
  });
  it('rolls failed settlement back while retaining the frozen ending for retry', async () => {
    let session = await engine.start(input);
    for (const choice of ['3', '2', '2', '1', '1']) session = await choose(session, choice);
    const original = payments.settle;
    payments.settle = async (state, tx, at) => {
      await original(state, tx, at);
      throw new Error('injected failure');
    };
    await expect(engine.settle('alice', session.id)).rejects.toThrow('injected failure');
    expect((await sessions.findById(session.id))?.status).toBe('SETTLING');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(0);
    payments.settle = original;
    expect((await engine.settle('alice', session.id)).receipt?.grossCredits).toBe('300');
  });
  it('recovers unpublished and expired runs and isolates presentation errors', async () => {
    const a = await engine.start(input);
    const b = await engine.start({ ...input, userId: 'bob' });
    await present(b);
    now += ADVENTURE_DECISION_MS;
    const failures = vi.fn();
    await makeEngine().recover(async () => {
      throw new Error('Discord unavailable');
    }, failures);
    expect(failures).toHaveBeenCalledTimes(2);
    expect((await sessions.findById(a.id))?.status).toBe('START_FAILED');
    expect((await sessions.findById(b.id))?.status).toBe('TIMED_OUT');
    expect((await energy.findById('alice'))?.currentEnergy).toBe(100);
    expect((await energy.findById('bob'))?.currentEnergy).toBe(92);
  });
  it('enforces unique active ownership even if a caller bypasses the engine', async () => {
    const state = await engine.start(input);
    await expect(
      sessions.withUser('alice', (tx) => sessions.create({ ...state, id: 'duplicate' }, tx)),
    ).rejects.toThrow();
  });
  it('supports two SQLite connections to the same file and persists ownership after reopening', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ririko-adventure-'));
    const url = join(directory, 'test.sqlite');
    const first = (await createDatabaseClient({
      dialect: 'sqlite',
      url,
      autoMigrate: true,
    })) as SqliteDatabaseClient;
    const second = (await createDatabaseClient({ dialect: 'sqlite', url })) as SqliteDatabaseClient;
    try {
      const a = new AdventureSessionRepository<ActiveAdventureSession>(first),
        b = new AdventureSessionRepository<ActiveAdventureSession>(second);
      const make = (repo: typeof a, client: SqliteDatabaseClient) =>
        new AdventureEngine({
          completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
          startCooldownMs: 0,
          sessions: repo,
          energy: new PlayerEnergyRepository(client),
          payments,
          now: () => now,
          seed: () => 1702,
        });
      const results = await Promise.allSettled([
        make(a, first).start(input),
        make(b, second).start({ ...input, channelId: 'elsewhere' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await new PlayerEnergyRepository(second).findById('alice'))?.currentEnergy).toBe(85);
      expect((await b.findActive('alice'))?.userId).toBe('alice');
    } finally {
      await first.close();
      await second.close();
    }
    const reopened = (await createDatabaseClient({
      dialect: 'sqlite',
      url,
    })) as SqliteDatabaseClient;
    try {
      expect(
        (await new AdventureSessionRepository<ActiveAdventureSession>(reopened).findActive('alice'))
          ?.userId,
      ).toBe('alice');
    } finally {
      await reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('adventure checks and random cursor', () => {
  const card: AdventureCardSnapshot = {
    name: 'Rem',
    level: 1,
    element: 'WATER',
    attack: 100,
    defense: 200,
    speed: 150,
  };
  it('adds affinity, respects exact stat thresholds and takes explicit failure branches', () => {
    const skill = {
      type: 'skill' as const,
      chance: 0.5,
      element: 'WATER' as const,
      success: 'yes',
      failure: 'no',
    };
    expect(resolveAdventureTransition(skill, card, () => 0.74)).toBe('yes');
    expect(resolveAdventureTransition(skill, card, () => 0.75)).toBe('no');
    expect(resolveAdventureTransition(skill, null, () => 0.6)).toBe('no');
    expect(
      resolveAdventureTransition(
        { type: 'stat', stat: 'speed', minimum: 150, success: 'yes', failure: 'no' },
        card,
        () => 0,
      ),
    ).toBe('yes');
    expect(
      resolveAdventureTransition(
        { type: 'element', element: 'ICE', success: 'yes', failure: 'no' },
        card,
        () => 0,
      ),
    ).toBe('no');
  });
  it('continues the same seeded stream after serializing state', () => {
    const cursor = { rngState: 1702 };
    const random = adventureRandom(cursor);
    random();
    random();
    const restored = adventureRandom(JSON.parse(JSON.stringify(cursor)) as typeof cursor);
    expect(Array.from({ length: 10 }, () => restored())).toEqual(
      Array.from({ length: 10 }, () => random()),
    );
  });
});
