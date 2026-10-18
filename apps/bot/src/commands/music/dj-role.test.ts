import { describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import {
  canControlPlayback,
  createDjRoleMiddleware,
  DJ_ONLY_MESSAGE,
  toPlaybackMember,
} from './dj-role.js';

const DJ = '700000000000000001';

describe('canControlPlayback (TASK-1161)', () => {
  const member = (roles: string[], canManageGuild = false) => ({
    hasRole: (id: string) => roles.includes(id),
    canManageGuild,
  });

  it('lets everyone control playback when there is no DJ role', () => {
    expect(canControlPlayback(member([]), null)).toBe(true);
    expect(canControlPlayback(null, null)).toBe(true);
  });

  it('needs the DJ role or Manage Server when one is set', () => {
    expect(canControlPlayback(member([DJ]), DJ)).toBe(true);
    expect(canControlPlayback(member([], true), DJ)).toBe(true);
    expect(canControlPlayback(member(['other']), DJ)).toBe(false);
    expect(canControlPlayback(null, DJ)).toBe(false);
  });

  it('reads raw interaction members, including Administrator', () => {
    const raw = (permissions: bigint) =>
      toPlaybackMember({ roles: [DJ], permissions: permissions.toString() } as never);
    expect(raw(0n)?.hasRole(DJ)).toBe(true);
    expect(raw(0n)?.canManageGuild).toBe(false);
    expect(raw(PermissionFlagsBits.Administrator)?.canManageGuild).toBe(true);
    expect(raw(PermissionFlagsBits.ManageGuild)?.canManageGuild).toBe(true);
  });
});

describe('createDjRoleMiddleware (TASK-1161)', () => {
  function context(roleIds: string[]) {
    return {
      guildId: 'g1',
      member: {
        roles: { cache: new Map(roleIds.map((id) => [id, {}])) },
        permissions: { has: () => false },
      },
      reply: vi.fn(),
    } as unknown as CommandContext & { reply: ReturnType<typeof vi.fn> };
  }

  it('stops members without the DJ role', async () => {
    const ctx = context([]);
    const next = vi.fn();
    await createDjRoleMiddleware(async () => DJ)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith({ content: DJ_ONLY_MESSAGE, ephemeral: true });
  });

  it('runs the command for DJs and when it does not apply', async () => {
    const next = vi.fn();
    await createDjRoleMiddleware(async () => DJ)(context([DJ]), next);
    const getDjRoleId = vi.fn();
    await createDjRoleMiddleware(getDjRoleId, () => false)(context([]), next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(getDjRoleId).not.toHaveBeenCalled();
  });
});
