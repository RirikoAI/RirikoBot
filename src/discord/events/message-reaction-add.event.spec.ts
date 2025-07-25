import { MessageReactionAddEvent } from '#discord/events/message-reaction-add.event';
import { DiscordClient } from '#discord/discord.client';
import { ReactionRoleService } from '#reaction-role/reaction-role.service';
import { MessageReaction, User, Guild, GuildMember, Role } from 'discord.js';
import { Logger } from '@nestjs/common';

jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockReturnValue({
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  }),
}));

describe('MessageReactionAddEvent', () => {
  let client: DiscordClient;
  let reactionRoleService: ReactionRoleService;
  let reaction: MessageReaction;
  let user: User;
  let guild: Guild;
  let member: GuildMember;
  let role: Role;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Clear all mocks
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
      assignRole: jest.fn(),
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

  // Rest of the test cases remain the same, but use mockLogger instead of Logger
  it('should handle reaction role assignment successfully', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockResolvedValue({ roleId: 'roleId' });
    reactionRoleService.hasPermission = jest.fn().mockReturnValue(true);
    reactionRoleService.isValidRole = jest.fn().mockReturnValue(true);
    reactionRoleService.assignRole = jest.fn().mockResolvedValue(true);
    guild.members.fetch = jest.fn().mockResolvedValue(member);

    MessageReactionAddEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(reactionRoleService.getReactionRole).toHaveBeenCalled();
    expect(reactionRoleService.hasPermission).toHaveBeenCalled();
    expect(reactionRoleService.assignRole).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalled();
  });

  // Update other test cases to use mockLogger instead of Logger
  it('should handle errors gracefully', async () => {
    reactionRoleService.getReactionRole = jest
      .fn()
      .mockRejectedValue(new Error('Test error'));

    MessageReactionAddEvent(client, reactionRoleService);
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(reaction, user);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error handling reaction add: Test error',
    );
  });

  // Rest of the test cases remain the same...
});
