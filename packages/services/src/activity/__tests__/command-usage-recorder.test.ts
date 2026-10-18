import { describe, expect, it, vi } from 'vitest';
import type { CommandUsageDaily } from '@ririko/database';
import { CommandUsageRecorder, utcDay } from '../command-usage-recorder.js';

const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 8, 26, 23, 59, 0);

function setup(now: { value: number }) {
  const written: CommandUsageDaily[][] = [];
  const repo = {
    addCommandUsage: vi.fn(async (rows: CommandUsageDaily[]) => {
      written.push(rows.map((row) => ({ ...row })));
    }),
    deleteCommandUsageBefore: vi.fn(async () => undefined),
  };
  const recorder = new CommandUsageRecorder(repo, { retentionDays: 90, now: () => now.value });
  return { repo, recorder, written };
}

describe('CommandUsageRecorder (TASK-1131)', () => {
  it('formats UTC days', () => {
    expect(utcDay(T0)).toBe('2026-09-26');
    expect(utcDay(T0 + 60_000)).toBe('2026-09-27');
  });

  it('buffers counts per guild, UTC day and command, and skips commands outside a guild', async () => {
    const now = { value: T0 };
    const { recorder, written } = setup(now);

    recorder.record('g1', 'play');
    recorder.record('g1', 'play');
    recorder.record('g2', 'play');
    recorder.record(null, 'help');
    now.value += 60_000; // next UTC day
    recorder.record('g1', 'play');
    await recorder.flush();

    expect(written).toEqual([
      [
        { guildId: 'g1', day: '2026-09-26', commandName: 'play', count: 2 },
        { guildId: 'g2', day: '2026-09-26', commandName: 'play', count: 1 },
        { guildId: 'g1', day: '2026-09-27', commandName: 'play', count: 1 },
      ],
    ]);

    await recorder.flush();
    expect(written[1]).toEqual([]);
  });

  it('keeps counts for the next flush when a write fails', async () => {
    const now = { value: T0 };
    const { repo, recorder, written } = setup(now);
    recorder.record('g1', 'play');
    repo.addCommandUsage.mockRejectedValueOnce(new Error('db down'));

    await expect(recorder.flush()).rejects.toThrow('db down');
    recorder.record('g1', 'play');
    await recorder.flush();

    expect(written).toEqual([
      [{ guildId: 'g1', day: '2026-09-26', commandName: 'play', count: 2 }],
    ]);
  });

  it('deletes rows past the retention once per UTC day', async () => {
    const now = { value: T0 };
    const { repo, recorder } = setup(now);

    await recorder.flush();
    await recorder.flush();
    expect(repo.deleteCommandUsageBefore).toHaveBeenCalledTimes(1);
    expect(repo.deleteCommandUsageBefore).toHaveBeenCalledWith(utcDay(T0 - 90 * DAY_MS));

    now.value += DAY_MS;
    await recorder.flush();
    expect(repo.deleteCommandUsageBefore).toHaveBeenCalledTimes(2);
  });

  it('writes what is buffered when stopped', async () => {
    const { recorder, written } = setup({ value: T0 });
    recorder.start();
    recorder.record('g1', 'help');
    await recorder.stop();
    expect(written).toEqual([
      [{ guildId: 'g1', day: '2026-09-26', commandName: 'help', count: 1 }],
    ]);
  });
});
