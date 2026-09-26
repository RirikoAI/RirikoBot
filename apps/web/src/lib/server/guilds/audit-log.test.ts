import { describe, expect, it, vi } from 'vitest';
import type { AuditLog } from '@ririko/database';
import {
  AUDIT_PAGE_SIZE,
  describeAuditAction,
  encodeAuditCursor,
  fieldLabel,
  formatAuditValue,
  loadAuditLog,
  parseAuditCursor,
} from './audit-log';

const GUILD = '100000000000000001';
const ACTOR = '200000000000000001';
const CHANNEL = '300000000000000001';
const ROLE = '400000000000000001';

function entry(index: number, details: AuditLog['details'] = {}): AuditLog {
  return {
    id: `id-${index}`,
    guildId: GUILD,
    actorUserId: ACTOR,
    action: 'guild_config.logging.update',
    details,
    ipAddress: '203.0.113.9',
    userAgent: 'Firefox',
    createdAt: new Date(Date.UTC(2026, 8, 26, 0, 0, 60 - index)),
  };
}

describe('audit log formatting (TASK-1132)', () => {
  it('round-trips cursors and rejects malformed ones', () => {
    const cursor = { createdAt: new Date(1_790_000_000_000), id: 'a1b2-c3' };
    expect(parseAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor);
    expect(parseAuditCursor('nope')).toBeUndefined();
    expect(parseAuditCursor(['1_a'])).toBeUndefined();
  });

  it('describes settings changes and humanizes field names', () => {
    expect(describeAuditAction('guild_config.automod.update')).toBe('AutoMod settings changed');
    expect(describeAuditAction('guild_config.commands.update')).toBe('Command settings changed');
    expect(describeAuditAction('guild_config.autovoice.update')).toBe(
      'Auto Voice settings changed',
    );
    expect(describeAuditAction('reaction_roles.publish')).toBe('Reaction role panel published');
    expect(describeAuditAction('guild_config.music.update')).toBe('music settings changed');
    expect(describeAuditAction('web.session.revoke')).toBe('web.session.revoke');
    expect(fieldLabel('logChannelId')).toBe('Log channel ID');
    expect(fieldLabel('mentionSpamExemptRoleIds')).toBe('Mention spam exempt role IDs');
  });

  it('formats values with channel and role names', () => {
    const names = new Map([
      [CHANNEL, '#mod-log'],
      [ROLE, '@Mods'],
    ]);
    expect(formatAuditValue(CHANNEL, names)).toBe('#mod-log');
    expect(formatAuditValue([ROLE, '499999999999999999'], names)).toBe('@Mods, 499999999999999999');
    expect(formatAuditValue(null, names)).toBe('(none)');
    expect(formatAuditValue([], names)).toBe('(none)');
    expect(formatAuditValue(true, names)).toBe('true');
    expect(formatAuditValue([{ threshold: 3, action: 'KICK' }], names)).toBe(
      '[{"threshold":3,"action":"KICK"}]',
    );
  });
});

describe('loadAuditLog (TASK-1132)', () => {
  function deps(rows: AuditLog[]) {
    return {
      audit: { listByGuild: vi.fn(async () => rows) },
      users: { lookup: vi.fn(async () => new Map()) },
      resources: {
        channelNames: vi.fn(async () => new Map([[CHANNEL, 'mod-log']])),
        memberRoles: vi.fn(async () => [{ id: ROLE, name: 'Mods', color: 0 }]),
      },
    };
  }

  it('renders field diffs, leaves out IP and user agent, and pages with a cursor', async () => {
    const rows = Array.from({ length: AUDIT_PAGE_SIZE + 1 }, (_, i) =>
      entry(i, {
        source: 'dashboard',
        changes: [{ field: 'logChannelId', before: null, after: CHANNEL }],
      }),
    );
    const d = deps(rows);

    const page = await loadAuditLog(d, GUILD, undefined);

    expect(d.audit.listByGuild).toHaveBeenCalledWith(GUILD, {
      limit: AUDIT_PAGE_SIZE + 1,
      before: undefined,
    });
    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.entries[0]).toEqual({
      id: 'id-0',
      actorUserId: ACTOR,
      source: 'dashboard',
      summary: 'Logging settings changed',
      changes: [{ field: 'Log channel ID', before: '(none)', after: '#mod-log' }],
      createdAt: rows[0]!.createdAt.toISOString(),
    });
    expect(JSON.stringify(page.entries)).not.toContain('203.0.113.9');
    expect(page.nextBefore).toBe(encodeAuditCursor(rows[AUDIT_PAGE_SIZE - 1]!));
  });

  it('shows entries without a change list and survives missing channel names', async () => {
    const d = deps([entry(0, null)]);
    d.resources.channelNames.mockRejectedValueOnce(new Error('Missing Access'));

    const page = await loadAuditLog(d, GUILD, undefined);
    expect(page.entries[0]?.changes).toEqual([]);
    expect(page.entries[0]?.source).toBeNull();
    expect(page.nextBefore).toBeNull();
  });
});
