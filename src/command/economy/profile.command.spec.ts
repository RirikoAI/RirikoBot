import ProfileCommand from './profile.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { EconomyService } from '#economy/economy.service';
import { DatabaseService } from '#database/database.service';
import { DiscordService } from '#discord/discord.service';
import { EconomyExtensions, EconomyServices } from '#economy/economy.module';
import { ImageUtil } from '#util/image/image.util';

describe('ProfileCommand', () => {
  let command: ProfileCommand;
  let economyService: EconomyService;
  let message: DiscordMessage;
  let interaction: DiscordInteraction;

  beforeEach(() => {
    const mockDatabaseService = {} as DatabaseService;
    const mockDiscordService = {} as DiscordService;
    const mockEconomyExtensions = {
      coins: {
        getBalance: jest.fn(),
        deductBalance: jest.fn(),
        addBalance: jest.fn(),
      },
      profile: {
        getProfile: jest.fn(),
        getUser: jest.fn(),
        setBackgroundImageURL: jest.fn(),
      },
      karma: {
        rewardUserForMessage: jest.fn(),
      },
      items: {
        findRandomItems: jest.fn(),
      },
    } as unknown as EconomyExtensions;
    const mockEconomyServices = {} as EconomyServices;

    economyService = new EconomyService(
      mockDiscordService,
      mockDatabaseService,
      mockEconomyExtensions,
      mockEconomyServices,
    );

    command = new ProfileCommand({ economy: economyService } as any);
    message = {
      author: { id: '123' },
      channel: { send: jest.fn() },
    } as any;
    interaction = {
      user: { id: '123' },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getUser: jest.fn(),
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
    } as any;
  });

  it('should get profile for prefix command', async () => {
    await command.runPrefix(message);

    expect(economyService.getProfile).toHaveBeenCalledWith(
      message.author,
      message.channel,
      message,
    );
  });

  it('should set banner for slash command', async () => {
    interaction.options.getSubcommand.mockReturnValue('set-banner');
    interaction.options.getString.mockReturnValue(
      'http://example.com/banner.jpg',
    );
    jest.spyOn(ImageUtil, 'isImage').mockResolvedValue(true);

    await command.runSlash(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(ImageUtil.isImage).toHaveBeenCalledWith(
      'http://example.com/banner.jpg',
    );
    expect(economyService.setBackgroundImageURL).toHaveBeenCalledWith(
      interaction.user,
      'http://example.com/banner.jpg',
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Your banner has been set!',
    });
  });

  it('should view profile for slash command', async () => {
    interaction.options.getSubcommand.mockReturnValue('view');
    interaction.options.getUser.mockReturnValue(null);

    await command.runSlash(interaction);

    expect(economyService.getProfile).toHaveBeenCalledWith(
      interaction.user,
      interaction.channel,
      interaction,
    );
  });

  it('should view profile for user menu command', async () => {
    (interaction as any).targetUser = { id: '123' };

    await command.runUserMenu(interaction);

    expect(economyService.getProfile).toHaveBeenCalledWith(
      (interaction as any).targetUser,
      interaction.channel,
      interaction,
    );
  });

  describe('ProfileCommand properties', () => {
    it('should have correct name and description', () => {
      expect(command.name).toBe('profile');
      expect(command.description).toBe('View your profile');
    });
  });

  describe('runPrefix', () => {
    it('should call getProfile with correct parameters', async () => {
      await command.runPrefix(message);

      expect(economyService.getProfile).toHaveBeenCalledWith(
        message.author,
        message.channel,
        message,
      );
    });
  });

  describe('runSlash', () => {
    it('should handle set-banner subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('set-banner');
      interaction.options.getString.mockReturnValue(
        'http://example.com/banner.jpg',
      );
      jest.spyOn(ImageUtil, 'isImage').mockResolvedValue(true);
      interaction.deferReply = jest.fn().mockResolvedValue({});

      await command.runSlash(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(ImageUtil.isImage).toHaveBeenCalledWith(
        'http://example.com/banner.jpg',
      );
      expect(economyService.setBackgroundImageURL).toHaveBeenCalledWith(
        interaction.user,
        'http://example.com/banner.jpg',
      );
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Your banner has been set!',
      });
    });

    it('should handle view subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('view');
      interaction.options.getUser.mockReturnValue(null);

      await command.runSlash(interaction);

      expect(economyService.getProfile).toHaveBeenCalledWith(
        interaction.user,
        interaction.channel,
        interaction,
      );
    });
  });
});
