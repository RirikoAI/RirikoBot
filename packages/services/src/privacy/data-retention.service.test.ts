import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildPurgeResult } from '@ririko/database';
import { DataRetentionService, RETENTION_DAYS } from './data-retention.service.js';

const DAY_MS = 86_400_000;
/** 10:00 UTC on a day that is neither the first nor the last of its month. */
const T0 = Date.UTC(2026, 9, 17, 10, 0, 0);

function setup(options: { initialDelayMs?: number; checkIntervalMs?: number } = {}) {
  const clock = { value: T0 };
  const repos = {
    ai: { deleteOlderThan: vi.fn(async (_cutoff: Date) => 4) },
    music: { deleteOlderThan: vi.fn(async (_cutoff: Date) => 3) },
    images: { deleteOlderThan: vi.fn(async (_cutoff: Date) => 2) },
    audit: { deleteOlderThan: vi.fn(async (_cutoff: Date) => 1) },
    guilds: {
      listDepartedBefore: vi.fn(async (_cutoff: Date): Promise<string[]> => []),
      purgeGuild: vi.fn(
        async (guildId: string, _cutoff: Date): Promise<GuildPurgeResult | null> => ({
          guildId,
          deleted: { xp_accounts: 3, guilds: 1 },
          detached: {},
        }),
      ),
    },
  };
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new DataRetentionService(repos, { now: () => clock.value, logger, ...options });
  return { clock, repos, logger, service };
}

describe('RETENTION_DAYS', () => {
  it('states the periods of the privacy policy', () => {
    expect(RETENTION_DAYS).toEqual({
      ai: 90,
      musicHistory: 90,
      imageJobs: 90,
      auditLog: 365,
      departedGuild: 90,
    });
  });
});

describe('DataRetentionService.runOnce', () => {
  it('hands each repository a cutoff of exactly its period before the injected clock', async () => {
    const { repos, service } = setup();

    await service.runOnce();

    expect(repos.ai.deleteOlderThan).toHaveBeenCalledWith(new Date(T0 - 90 * DAY_MS));
    expect(repos.music.deleteOlderThan).toHaveBeenCalledWith(new Date(T0 - 90 * DAY_MS));
    expect(repos.images.deleteOlderThan).toHaveBeenCalledWith(new Date(T0 - 90 * DAY_MS));
    expect(repos.audit.deleteOlderThan).toHaveBeenCalledWith(new Date(T0 - 365 * DAY_MS));
    expect(repos.guilds.listDepartedBefore).toHaveBeenCalledWith(new Date(T0 - 90 * DAY_MS));
  });

  it('returns the counts and logs one line with them', async () => {
    const { logger, service } = setup();

    const counts = await service.runOnce();

    expect(counts).toEqual({
      ai: 4,
      musicHistory: 3,
      imageJobs: 2,
      auditLog: 1,
      departedGuild: 0,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Purge finished: ai=4, musicHistory=3, imageJobs=2, auditLog=1, departedGuild=0',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a failing table and still purges the others', async () => {
    const { repos, logger, service } = setup();
    repos.music.deleteOlderThan.mockRejectedValueOnce(new Error('connection reset'));

    const counts = await service.runOnce();

    expect(counts).toEqual({
      ai: 4,
      musicHistory: null,
      imageJobs: 2,
      auditLog: 1,
      departedGuild: 0,
    });
    expect(repos.images.deleteOlderThan).toHaveBeenCalledTimes(1);
    expect(repos.audit.deleteOlderThan).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[DataRetention] The musicHistory purge failed: connection reset',
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Purge finished: ai=4, musicHistory=failed, imageJobs=2, auditLog=1, departedGuild=0',
    );
  });

  it('logs a thrown value that is not an Error', async () => {
    const { repos, logger, service } = setup();
    repos.ai.deleteOlderThan.mockRejectedValueOnce('boom');

    await service.runOnce();

    expect(logger.error).toHaveBeenCalledWith('[DataRetention] The ai purge failed: boom');
  });

  it('lets calls made during a purge share it', async () => {
    const { repos, service } = setup();
    let release: () => void = () => undefined;
    repos.ai.deleteOlderThan.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(9))),
    );

    const first = service.runOnce();
    const second = service.runOnce();
    release();

    expect(await first).toEqual(await second);
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);
  });
});

describe('DataRetentionService departed servers (TASK-1935)', () => {
  it('purges each departed server once and counts the servers purged', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockResolvedValueOnce(['g1', 'g2']);

    const counts = await service.runOnce();

    const cutoff = new Date(T0 - 90 * DAY_MS);
    expect(repos.guilds.purgeGuild).toHaveBeenCalledTimes(2);
    expect(repos.guilds.purgeGuild).toHaveBeenNthCalledWith(1, 'g1', cutoff);
    expect(repos.guilds.purgeGuild).toHaveBeenNthCalledWith(2, 'g2', cutoff);
    expect(counts.departedGuild).toBe(2);
    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Deleted server g1: xp_accounts=3, guilds=1',
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Purge finished: ai=4, musicHistory=3, imageJobs=2, auditLog=1, departedGuild=2',
    );
  });

  it('logs the rows that were unlinked from the server, as counts only', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockResolvedValueOnce(['g1']);
    repos.guilds.purgeGuild.mockResolvedValueOnce({
      guildId: 'g1',
      deleted: { giveaways: 2, guilds: 1 },
      detached: { reminders: 4, economy_transactions: 9 },
    });

    await service.runOnce();

    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Deleted server g1: giveaways=2, guilds=1; unlinked from the server: reminders=4, economy_transactions=9',
    );
  });

  it('does not count a server that was added back before its purge', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockResolvedValueOnce(['g1', 'g2']);
    repos.guilds.purgeGuild.mockResolvedValueOnce(null);

    const counts = await service.runOnce();

    expect(counts.departedGuild).toBe(1);
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Deleted server g1'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a server that fails, still purges the next one and leaves the day open', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockResolvedValue(['g1', 'g2']);
    repos.guilds.purgeGuild.mockRejectedValueOnce(new Error('deadlock detected'));

    const counts = await service.runOnce();

    expect(counts.departedGuild).toBe(1);
    expect(repos.guilds.purgeGuild).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      '[DataRetention] The purge of server g1 failed: deadlock detected',
    );
    await service.tick(); // not a complete purge, so the next check tries again
    expect(repos.guilds.listDepartedBefore).toHaveBeenCalledTimes(2);
  });

  it('reports the departedGuild table as failed when the list cannot be read', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockRejectedValueOnce(new Error('connection reset'));

    const counts = await service.runOnce();

    expect(counts).toEqual({
      ai: 4,
      musicHistory: 3,
      imageJobs: 2,
      auditLog: 1,
      departedGuild: null,
    });
    expect(logger.error).toHaveBeenCalledWith(
      '[DataRetention] The departedGuild purge failed: connection reset',
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[DataRetention] Purge finished: ai=4, musicHistory=3, imageJobs=2, auditLog=1, departedGuild=failed',
    );
  });

  it('logs a failure that is not an Error', async () => {
    const { repos, logger, service } = setup();
    repos.guilds.listDepartedBefore.mockResolvedValueOnce(['g1']);
    repos.guilds.purgeGuild.mockRejectedValueOnce('boom');

    await service.runOnce();

    expect(logger.error).toHaveBeenCalledWith(
      '[DataRetention] The purge of server g1 failed: boom',
    );
  });

  it('puts the departed server cutoff exactly 90 days before the clock', async () => {
    const { clock, repos, service } = setup();
    clock.value = Date.UTC(2026, 9, 18, 0, 0, 0, 0);

    await service.runOnce();

    expect(repos.guilds.listDepartedBefore).toHaveBeenCalledWith(new Date(Date.UTC(2026, 6, 20)));
  });
});

describe('DataRetentionService day guard', () => {
  it('purges once per UTC day', async () => {
    const { clock, repos, service } = setup();

    await service.tick();
    await service.tick();
    clock.value = T0 + 5 * 3_600_000; // 15:00, same UTC day
    await service.tick();
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);

    clock.value = Date.UTC(2026, 9, 17, 23, 59, 59, 999);
    await service.tick();
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);

    clock.value = Date.UTC(2026, 9, 18, 0, 0, 0, 0); // first millisecond of the next UTC day
    await service.tick();
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(2);
    expect(repos.audit.deleteOlderThan).toHaveBeenLastCalledWith(
      new Date(Date.UTC(2026, 9, 18) - 365 * DAY_MS),
    );
  });

  it('tries again at the next check when a table failed', async () => {
    const { repos, service } = setup();
    repos.images.deleteOlderThan.mockRejectedValueOnce(new Error('locked'));

    await service.tick();
    expect(repos.images.deleteOlderThan).toHaveBeenCalledTimes(1);

    await service.tick();
    expect(repos.images.deleteOlderThan).toHaveBeenCalledTimes(2);

    await service.tick(); // the retry succeeded, so the day is done
    expect(repos.images.deleteOlderThan).toHaveBeenCalledTimes(2);
  });

  it('does not start a second purge while one runs', async () => {
    const { repos, service } = setup();
    let release: () => void = () => undefined;
    repos.ai.deleteOlderThan.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );

    const running = service.tick();
    await service.tick();
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);
    release();
    await running;
  });
});

describe('DataRetentionService timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs shortly after start, then checks hourly and purges again only on a new day', async () => {
    const { clock, repos, service } = setup({ initialDelayMs: 60_000, checkIntervalMs: 3_600_000 });

    service.start();
    service.start(); // a second start changes nothing
    await vi.advanceTimersByTimeAsync(59_999);
    expect(repos.ai.deleteOlderThan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_600_000); // an hourly check on the same day
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);

    clock.value += DAY_MS;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(2);
    await service.stop();
  });

  it('stops the timers and waits for a purge that is running', async () => {
    const { repos, service } = setup({ initialDelayMs: 10 });
    let release: () => void = () => undefined;
    repos.ai.deleteOlderThan.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );

    service.start();
    await vi.advanceTimersByTimeAsync(10);
    let stopped = false;
    const stopping = service.stop().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);

    release();
    await stopping;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * 3_600_000);
    expect(repos.ai.deleteOlderThan).toHaveBeenCalledTimes(1);
  });

  it('stops cleanly when it never started', async () => {
    const { service } = setup();
    await expect(service.stop()).resolves.toBeUndefined();
  });

  it('logs to the console when no logger is given', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repo = (n: number | Error) => ({
      deleteOlderThan: vi.fn(async () => {
        if (n instanceof Error) throw n;
        return n;
      }),
    });
    const service = new DataRetentionService({
      ai: repo(1),
      music: repo(new Error('nope')),
      images: repo(0),
      audit: repo(0),
      guilds: { listDepartedBefore: async () => [], purgeGuild: async () => null },
    });

    await service.runOnce();

    expect(log).toHaveBeenCalledWith(
      '[DataRetention] Purge finished: ai=1, musicHistory=failed, imageJobs=0, auditLog=0, departedGuild=0',
    );
    expect(error).toHaveBeenCalledWith('[DataRetention] The musicHistory purge failed: nope');
    log.mockRestore();
    error.mockRestore();
  });
});
