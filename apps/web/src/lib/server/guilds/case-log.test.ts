import { describe, expect, it, vi } from 'vitest';
import type { ModerationCase } from '@ririko/database';
import {
  CASES_PAGE_SIZE,
  caseLogQuery,
  formatDuration,
  loadCaseDetail,
  loadCaseLog,
  parseCaseLogFilters,
} from './case-log';

const GUILD = '100000000000000001';
const TARGET = '200000000000000001';
const MOD = '200000000000000002';

function modCase(caseNumber: number, overrides: Partial<ModerationCase> = {}): ModerationCase {
  return {
    id: `case-${caseNumber}`,
    guildId: GUILD,
    caseNumber,
    type: 'WARN',
    targetUserId: TARGET,
    moderatorUserId: MOD,
    reason: 'Spam',
    durationSeconds: null,
    metadata: {},
    createdAt: new Date(Date.UTC(2026, 8, caseNumber)),
    ...overrides,
  };
}

function deps(cases: ModerationCase[]) {
  return {
    moderation: {
      listCases: vi.fn(async (_guildId: string, options: { limit?: number }) => ({
        items: cases.slice(0, options.limit),
        total: cases.length,
        limit: options.limit ?? 20,
        offset: 0,
      })),
      listCaseTypes: vi.fn(async () => ['BAN', 'WARN']),
      getCaseByNumber: vi.fn(
        async (_guildId: string, n: number) => cases.find((c) => c.caseNumber === n) ?? null,
      ),
      listWarnings: vi.fn(async () => [
        {
          id: 'w1',
          guildId: GUILD,
          userId: TARGET,
          moderatorId: MOD,
          reason: 'Spam',
          severity: 1,
          isActive: true,
          expiresAt: new Date(Date.UTC(2026, 8, 1)),
          createdAt: new Date(Date.UTC(2026, 7, 1)),
        },
      ]),
      getNotesByUser: vi.fn(async () => []),
    },
    users: {
      lookup: vi.fn(async (ids: Iterable<string>) => {
        const all = new Set(ids);
        return new Map(
          [...all].map((id) => [id, { id, name: `name-${id}`, username: id, avatarUrl: '' }]),
        );
      }),
    },
  };
}

describe('parseCaseLogFilters (TASK-1132)', () => {
  it('keeps valid filters and reports invalid ones', () => {
    const { filters, errors } = parseCaseLogFilters({
      user: ` ${TARGET} `,
      moderator: 'bob',
      type: 'ban',
      from: '2026-09-01',
      to: '2026-02-30',
      before: '40',
    });
    expect(filters).toEqual({ user: TARGET, type: 'BAN', from: '2026-09-01', before: 40 });
    expect(errors).toEqual({
      moderator: 'Enter a Discord user ID (17 to 20 digits).',
      to: 'Enter a date as YYYY-MM-DD.',
    });
  });

  it('rejects an end date before the start date', () => {
    const { filters, errors } = parseCaseLogFilters({ from: '2026-09-10', to: '2026-09-01' });
    expect(filters).toEqual({ from: '2026-09-10' });
    expect(errors.to).toBe('The end date is before the start date.');
  });

  it('builds a query string without empty filters', () => {
    expect(caseLogQuery({ user: TARGET, before: undefined, type: 'BAN' })).toBe(
      `?user=${TARGET}&type=BAN`,
    );
    expect(caseLogQuery({})).toBe('');
  });
});

describe('loadCaseLog (TASK-1132)', () => {
  it('passes the filters as a UTC day range and returns a cursor when more cases exist', async () => {
    const cases = Array.from({ length: CASES_PAGE_SIZE + 1 }, (_, i) => modCase(40 - i));
    const d = deps(cases);

    const page = await loadCaseLog(d, GUILD, {
      user: TARGET,
      from: '2026-09-01',
      to: '2026-09-02',
      before: 41,
    });

    expect(d.moderation.listCases).toHaveBeenCalledWith(GUILD, {
      targetUserId: TARGET,
      moderatorUserId: undefined,
      type: undefined,
      createdFrom: new Date('2026-09-01T00:00:00Z'),
      createdBefore: new Date('2026-09-03T00:00:00Z'),
      beforeCaseNumber: 41,
      limit: CASES_PAGE_SIZE + 1,
    });
    expect(page.cases).toHaveLength(CASES_PAGE_SIZE);
    expect(page.nextBefore).toBe(40 - CASES_PAGE_SIZE + 1);
    expect(page.types).toEqual(['BAN', 'WARN']);
    expect(page.users.get(MOD)?.name).toBe(`name-${MOD}`);
  });

  it('has no cursor on the last page', async () => {
    const page = await loadCaseLog(deps([modCase(2), modCase(1)]), GUILD, {});
    expect(page.nextBefore).toBeNull();
  });
});

describe('loadCaseDetail (TASK-1132)', () => {
  it('returns the case with the target history, warnings and notes', async () => {
    const d = deps([modCase(3, { type: 'BAN' }), modCase(2), modCase(1)]);
    const detail = await loadCaseDetail(d, GUILD, 2, Date.UTC(2026, 8, 26));

    expect(detail?.case.caseNumber).toBe(2);
    expect(detail?.history.map((c) => c.caseNumber)).toEqual([3, 1]);
    // Active in the table but past its expiry, so it no longer counts.
    expect(detail?.warnings[0]?.active).toBe(false);
  });

  it('returns null for a case the guild does not have', async () => {
    expect(await loadCaseDetail(deps([]), GUILD, 9)).toBeNull();
  });
});

describe('formatDuration (TASK-1132)', () => {
  it('shows the two largest units', () => {
    expect(formatDuration(600)).toBe('10 minutes');
    expect(formatDuration(90_061)).toBe('1 day 1 hour');
    expect(formatDuration(0)).toBe('0 seconds');
  });
});
