import { GuildMemberAddEvent } from '#discord/events/guild-member-add.event';
import { DiscordClient } from '#discord/discord.client';
import { CommandService } from '#command/command.service';
import { Events, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { Logger } from '@nestjs/common';
import { WelcomeCard } from '#util/banner/welcome-card.util';

jest.mock('#util/banner/welcome-card.util');
jest.mock('@nestjs/common', () => ({
  Logger: {
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('GuildMemberAddEvent', () => {
  let client: DiscordClient;
  let commandService: CommandService;
  let member: GuildMember;

  beforeEach(() => {
    client = {
      on: jest.fn(),
    } as unknown as DiscordClient;

    commandService = {
      db: {
        guildRepository: {
          findOne: jest.fn(),
        },
      },
    } as unknown as CommandService;

    member = {
      user: {
        bot: false,
      },
      guild: {
        id: 'guildId',
        channels: {
          cache: {
            get: jest.fn(),
          },
        },
      },
      displayName: 'testUser',
      displayAvatarURL: jest.fn().mockReturnValue('avatarURL'),
    } as unknown as GuildMember;
  });

  it('should be defined', () => {
    expect(GuildMemberAddEvent).toBeDefined();
  });

  it('should register an event handler for GuildMemberAdd', () => {
    GuildMemberAddEvent(client, commandService);
    expect(client.on).toHaveBeenCalledWith(
      Events.GuildMemberAdd,
      expect.any(Function),
    );
  });

  it('should send a welcome message when a new member joins', async () => {
    const guildConfig = {
      configurations: [
        { name: 'welcomer_enabled', value: 'true' },
        { name: 'welcomer_channel', value: 'channelId' },
        { name: 'welcomer_bg', value: 'backgroundImgURL' },
      ],
    };

    commandService.db.guildRepository.findOne = jest
      .fn()
      .mockResolvedValue(guildConfig);

    const channel = {
      send: jest.fn(),
    } as unknown as GuildTextBasedChannel;

    member.guild.channels.cache.get = jest.fn().mockReturnValue(channel);

    const welcomeCard = new WelcomeCard();
    welcomeCard.generate = jest.fn().mockResolvedValue(Buffer.from(''));

    GuildMemberAddEvent(client, commandService);

    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(member);

    expect(commandService.db.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: member.guild.id },
    });
    expect(member.guild.channels.cache.get).toHaveBeenCalledWith('channelId');
    expect(welcomeCard.generate).toBeDefined();
    expect(channel.send).toHaveBeenCalled();
  });

  it('should log an error if something goes wrong', async () => {
    commandService.db.guildRepository.findOne = jest
      .fn()
      .mockRejectedValue(new Error('Test error'));

    GuildMemberAddEvent(client, commandService);

    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(member);

    expect(Logger.error).toHaveBeenCalledWith('Test error', expect.any(String));
  });
});
