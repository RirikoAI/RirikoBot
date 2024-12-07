import { Test, TestingModule } from '@nestjs/testing';
import { KarmaExtension } from './karma.extension';
import { StringUtil } from '#util/string/string.util';
import { DiscordMessage } from '#command/command.types';

describe('KarmaExtension', () => {
  let karmaExtension: KarmaExtension;
  let mockMessage: DiscordMessage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KarmaExtension],
    }).compile();

    karmaExtension = module.get<KarmaExtension>(KarmaExtension);

    mockMessage = {
      author: {
        id: '123',
        username: 'testUser',
        send: jest.fn(),
      },
      content: '',
      guild: {
        name: 'testGuild',
      },
      channel: {
        send: jest.fn(),
      },
    } as unknown as DiscordMessage;
  });

  it('should not reward user if message is gibberish', async () => {
    jest.spyOn(StringUtil, 'isGibberish').mockReturnValue(true);

    await karmaExtension.rewardUserForMessage(mockMessage);

    expect(mockMessage.author.send).not.toHaveBeenCalled();
    expect(mockMessage.channel.send).not.toHaveBeenCalled();
  });

  it('should reward user with 1 karma and 1 coin for messages with less than 10 words', async () => {
    jest.spyOn(StringUtil, 'isGibberish').mockReturnValue(false);
    mockMessage.content = 'This is a short message';

    const user = { karma: 0, coins: 0 };
    karmaExtension.extensions = {
      profile: { getUser: jest.fn().mockResolvedValue(user) },
    } as any;
    karmaExtension.db = { userRepository: { save: jest.fn() } } as any;

    await karmaExtension.rewardUserForMessage(mockMessage);

    expect(user.karma).toBe(1);
    expect(user.coins).toBe(1);
    expect(karmaExtension.db.userRepository.save).toHaveBeenCalledWith(user);
  });

  it('should reward user with 2 karma and 2 coins for messages with 10 or more words', async () => {
    jest.spyOn(StringUtil, 'isGibberish').mockReturnValue(false);
    mockMessage.content =
      'This is a longer message that has more than ten words in it';

    const user = { karma: 0, coins: 0 };
    karmaExtension.extensions = {
      profile: { getUser: jest.fn().mockResolvedValue(user) },
    } as any;
    karmaExtension.db = { userRepository: { save: jest.fn() } } as any;

    await karmaExtension.rewardUserForMessage(mockMessage);

    expect(user.karma).toBe(2);
    expect(user.coins).toBe(2);
    expect(karmaExtension.db.userRepository.save).toHaveBeenCalledWith(user);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
