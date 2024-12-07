import BalanceCommand from './balance.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { EconomyService } from '#economy/economy.service';
import { DatabaseService } from '#database/database.service';
import { DiscordService } from '#discord/discord.service';
import { EconomyExtensions, EconomyServices } from '#economy/economy.module';

describe('BalanceCommand', () => {
  let command: BalanceCommand;
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

    command = new BalanceCommand({ economy: economyService } as any);
    message = {
      author: { id: '123' },
      channel: { send: jest.fn() },
    } as any;
    interaction = {
      user: { id: '123' },
      reply: jest.fn(),
    } as any;
  });

  it('should send balance in a message for prefix command', async () => {
    jest.spyOn(economyService, 'getBalance').mockResolvedValue(100);

    await command.runPrefix(message);

    expect(economyService.getBalance).toHaveBeenCalledWith('123');
    expect(message.channel.send).toBeDefined();
  });

  it('should send balance in a reply for slash command', async () => {
    jest.spyOn(economyService, 'getBalance').mockResolvedValue(100);

    await command.runSlash(interaction);

    expect(economyService.getBalance).toHaveBeenCalledWith('123');
    expect(interaction.reply).toBeDefined();
  });
});
