import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Collection } from 'discord.js';
import type { Guild, GuildMember, Message, GuildTextBasedChannel } from 'discord.js';
import { createEventBus } from '@ririko/core';
import type { CoreEvents } from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import { PermissionService } from './permission.service.js';
import { PurgeService } from './purge.service.js';

function createMockGuild() {
  const botMember: Record<string, unknown> = {
    id: 'bot_id',
    permissions: {
      has: vi.fn(() => true),
    },
    roles: {
      highest: { position: 50 },
    },
  };

  const guild: Record<string, unknown> = {
    id: 'guild_1',
    name: 'Test Guild',
    ownerId: 'owner_id',
    client: {
      user: { id: 'bot_id' },
    },
    members: {
      me: botMember,
      fetchMe: vi.fn().mockResolvedValue(botMember),
    },
  };

  return guild as unknown as Guild;
}

function createMockMember(id: string, hasPerm: boolean = true) {
  const member: Record<string, unknown> = {
    id,
    user: { id, tag: `User#${id}` },
    roles: {
      highest: { position: 40 },
    },
    permissions: {
      has: vi.fn(() => hasPerm),
    },
  };
  return member as unknown as GuildMember;
}

function createMockMessage(
  id: string,
  authorId: string,
  content: string,
  isBot: boolean = false,
  attachmentsCount: number = 0,
  ageInDays: number = 1,
) {
  const createdTimestamp = Date.now() - ageInDays * 24 * 60 * 60 * 1000;
  return {
    id,
    author: { id: authorId, bot: isBot },
    content,
    attachments: { size: attachmentsCount },
    createdTimestamp,
  } as unknown as Message;
}

describe('PurgeService — TASK-0712', () => {
  let permissionService: PermissionService;
  let mockModRepo: { createCase: ReturnType<typeof vi.fn> };
  let eventBus: ReturnType<typeof createEventBus<CoreEvents>>;
  let purgeService: PurgeService;

  beforeEach(() => {
    permissionService = new PermissionService();
    mockModRepo = {
      createCase: vi.fn().mockResolvedValue({
        id: 'case_purge_1',
        caseNumber: 99,
      }),
    };
    eventBus = createEventBus<CoreEvents>();
    purgeService = new PurgeService(
      permissionService,
      mockModRepo as unknown as ModerationRepository,
      eventBus,
    );
  });

  it('rejects purge if invoker lacks ManageMessages permission', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('unauthorized_user', false);
    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: { fetch: vi.fn() },
    } as unknown as GuildTextBasedChannel;

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 20,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ManageMessages');
  });

  it('purges specified message count and records database case', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('mod_1', true);

    const messages = new Collection<string, Message>();
    for (let i = 1; i <= 10; i++) {
      messages.set(`m_${i}`, createMockMessage(`m_${i}`, 'user_a', `Hello ${i}`));
    }

    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
      bulkDelete: vi.fn().mockImplementation(async (msgs: Message[]) => new Collection(msgs.map((m) => [m.id, m]))),
    } as unknown as GuildTextBasedChannel;

    const eventSpy = vi.fn();
    eventBus.on('moderation:actionExecuted', eventSpy);

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 5,
      reason: 'Clean test chat',
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(5);
    expect(mockChannel.bulkDelete).toHaveBeenCalled();
    expect(mockModRepo.createCase).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild_1',
        type: 'PURGE',
        reason: 'Clean test chat',
      }),
    );
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PURGE',
        guildId: 'guild_1',
      }),
    );
  });

  it('filters messages by user ID', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('mod_1', true);

    const messages = new Collection<string, Message>();
    messages.set('m_1', createMockMessage('m_1', 'user_target', 'Spam 1'));
    messages.set('m_2', createMockMessage('m_2', 'user_innocent', 'Good message'));
    messages.set('m_3', createMockMessage('m_3', 'user_target', 'Spam 2'));

    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
      bulkDelete: vi.fn().mockImplementation(async (msgs: Message[]) => new Collection(msgs.map((m) => [m.id, m]))),
    } as unknown as GuildTextBasedChannel;

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 10,
      filters: { userId: 'user_target' },
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(mockChannel.bulkDelete).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'm_1' }),
        expect.objectContaining({ id: 'm_3' }),
      ]),
      true,
    );
  });

  it('filters messages containing Discord invite links', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('mod_1', true);

    const messages = new Collection<string, Message>();
    messages.set('m_1', createMockMessage('m_1', 'user_1', 'Join my discord.gg/test-server'));
    messages.set('m_2', createMockMessage('m_2', 'user_1', 'Regular message'));
    messages.set('m_3', createMockMessage('m_3', 'user_2', 'Check https://discord.com/invite/abc123'));

    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
      bulkDelete: vi.fn().mockImplementation(async (msgs: Message[]) => new Collection(msgs.map((m) => [m.id, m]))),
    } as unknown as GuildTextBasedChannel;

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 10,
      filters: { invitesOnly: true },
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
  });

  it('filters messages from bot accounts only', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('mod_1', true);

    const messages = new Collection<string, Message>();
    messages.set('m_1', createMockMessage('m_1', 'bot_a', 'Bot log', true));
    messages.set('m_2', createMockMessage('m_2', 'human_a', 'Human reply', false));
    messages.set('m_3', createMockMessage('m_3', 'bot_b', 'Bot alert', true));

    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
      bulkDelete: vi.fn().mockImplementation(async (msgs: Message[]) => new Collection(msgs.map((m) => [m.id, m]))),
    } as unknown as GuildTextBasedChannel;

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 10,
      filters: { botsOnly: true },
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
  });

  it('respects Discord 14-day API bulk delete limit', async () => {
    const guild = createMockGuild();
    const invoker = createMockMember('mod_1', true);

    const messages = new Collection<string, Message>();
    messages.set('m_new', createMockMessage('m_new', 'user_1', 'Recent message', false, 0, 2)); // 2 days old
    messages.set('m_old', createMockMessage('m_old', 'user_1', 'Old message', false, 0, 16)); // 16 days old (>14d)

    const mockChannel = {
      id: 'chan_1',
      permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
      bulkDelete: vi.fn().mockImplementation(async (msgs: Message[]) => new Collection(msgs.map((m) => [m.id, m]))),
    } as unknown as GuildTextBasedChannel;

    const result = await purgeService.purgeMessages({
      guild,
      invoker,
      channel: mockChannel,
      count: 10,
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(1);
    expect(result.skippedOlderThan14Days).toBe(1);
    expect(mockChannel.bulkDelete).toHaveBeenCalledWith([expect.objectContaining({ id: 'm_new' })], true);
  });
});
