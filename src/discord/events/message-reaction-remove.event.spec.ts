import { MessageReactionRemoveEvent } from '#discord/events/message-reaction-remove.event';
import { DiscordClient } from '#discord/discord.client';
import { ReactionRoleService } from '#reaction-role/reaction-role.service';
import {
  Events,
  MessageReaction,
  User,
  Guild,
  GuildMember,
  Role,
} from 'discord.js';
import { Logger } from '@nestjs/common';

jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockReturnValue({
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  }),
}));

describe('MessageReactionRemoveEvent', () => {
  let client: DiscordClient;
  let reactionRoleService: ReactionRoleService;
  let reaction: MessageReaction;
  let user: User;
  let guild: Guild;
  let member: GuildMember;
  let role: Role;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    } as any;

    (Logger as any).mockImplementation(() => mockLogger);

    client = {
      on: jest.fn(),
    } as unknown as DiscordClient;

    reactionRoleService = {
      getReactionRole: jest.fn(),
      hasPermission: jest.fn(),
      isValidRole: jest.fn(),
      removeRole: jest.fn(),
    } as unknown as ReactionRoleService;

    role = {
      name: 'testRole',
    } as unknown as Role;

    guild = {
      id: 'guildId',
      name: 'testGuild',
      members: {
        fetch: jest.fn(),
      },
      roles: {
        cache: {
          get: jest.fn().mockReturnValue(role),
        },
      },
    } as unknown as Guild;

    member = {
      id: 'memberId',
    } as unknown as GuildMember;

    reaction = {
      partial: false,
      message: {
        id: 'messageId',
        guild: guild,
      },
      emoji: {
        id: 'emojiId',
        name: 'testEmoji',
      },
    } as unknown as MessageReaction;

    user = {
      bot: false,
      partial: false,
      id: 'userId',
      tag: 'user#1234',
    } as unknown as User;
  });

  it('should be defined', () => {
    expect(MessageReactionRemoveEvent).toBeDefined();
  });

  it('should register an event handler for MessageReactionRemove', () => {
    MessageReactionRemoveEvent(client, reactionRoleService);
    expect(client.on).toHaveBeenCalledWith(
      Events.MessageReactionRemove,
      expect.any(Function),
    );
  });

  it('should handle role removal successfully', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockResolvedValue({ roleId: 'roleId' });
    reactionRoleService.hasPermission = jest.fn().mockReturnValue(true);
    reactionRoleService.isValidRole = jest.fn().mockReturnValue(true);
    reactionRoleService.removeRole = jest.fn().mockResolvedValue(true);
    guild.members.fetch = jest.fn().mockResolvedValue(member);

    MessageReactionRemoveEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(reactionRoleService.getReactionRole).toHaveBeenCalled();
    expect(reactionRoleService.hasPermission).toHaveBeenCalled();
    expect(reactionRoleService.removeRole).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Removed role'),
    );
  });

  it('should skip if user is a bot', async () => {
    user.bot = true;

    MessageReactionRemoveEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(reactionRoleService.getReactionRole).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockRejectedValue(new Error('Test error'));

    MessageReactionRemoveEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error handling reaction remove: Test error',
    );
  });

  it('should warn if bot lacks permissions', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockResolvedValue({ roleId: 'roleId' });
    reactionRoleService.hasPermission = jest.fn().mockReturnValue(false);

    MessageReactionRemoveEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Bot doesn't have permission"),
    );
  });

  it('should handle invalid roles', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockResolvedValue({ roleId: 'roleId' });
    reactionRoleService.hasPermission = jest.fn().mockReturnValue(true);
    reactionRoleService.isValidRole = jest.fn().mockReturnValue(false);

    MessageReactionRemoveEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid role'),
    );
  });
});
