import { Test, TestingModule } from '@nestjs/testing';
import { ProfileExtension } from './profile.extension';
import { EconomyUtil } from '#util/economy/economy.util';
import { RankCard } from '#util/banner/rank-card.util';
import { BadgesUtil } from '#util/discord/badges.util';
import { User, GuildMember, Guild, TextChannel } from 'discord.js';
import { DiscordMessage } from '#command/command.types';

describe('ProfileExtension', () => {
  let profileExtension: ProfileExtension;
  let mockUser: User;
  let mockGuild: Guild;
  let mockChannel: TextChannel;
  let mockMessage: DiscordMessage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfileExtension],
    }).compile();

    profileExtension = module.get<ProfileExtension>(ProfileExtension);

    profileExtension.db = {
      userRepository: {
        save: jest.fn(),
        findOne: jest.fn(),
      },
    } as any;

    mockUser = {
      id: '123',
      username: 'testUser',
      displayName: 'Test User',
      displayAvatarURL: jest
        .fn()
        .mockReturnValue('http://example.com/avatar.png'),
    } as unknown as User;

    mockGuild = {
      members: {
        fetch: jest.fn().mockResolvedValue({
          presence: { status: 'online' },
        } as GuildMember),
      },
    } as unknown as Guild;

    mockChannel = {
      send: jest.fn(),
    } as unknown as TextChannel;

    mockMessage = {
      guild: mockGuild,
      channel: mockChannel,
      reply: jest.fn(),
    } as unknown as DiscordMessage;
  });

  it('should get user profile and send rank card', async () => {
    const userDB = {
      karma: 100,
      backgroundImageURL: 'http://example.com/bg.png',
    };
    jest.spyOn(profileExtension, 'getUser').mockResolvedValue(userDB as any);
    jest.spyOn(EconomyUtil, 'getCurrentLevel').mockReturnValue(1);
    jest.spyOn(BadgesUtil, 'getBadges').mockResolvedValue([]);
    jest
      .spyOn(RankCard.prototype, 'generateBanner')
      .mockResolvedValue(Buffer.from(''));

    await profileExtension.getProfile(mockUser, mockChannel, mockMessage);

    expect(profileExtension.getUser).toHaveBeenCalledWith(mockUser);
    expect(mockGuild.members.fetch).toHaveBeenCalledWith(mockUser.id);
    expect(EconomyUtil.getCurrentLevel).toHaveBeenCalledWith(userDB.karma);
    expect(BadgesUtil.getBadges).toHaveBeenCalled();
    expect(RankCard.prototype.generateBanner).toHaveBeenCalled();
    expect(mockMessage.reply).toHaveBeenCalled();
  });

  it('should set background image URL for user', async () => {
    const userDB = { backgroundImageURL: '' };
    jest.spyOn(profileExtension, 'getUser').mockResolvedValue(userDB as any);
    jest
      .spyOn(profileExtension.db.userRepository, 'save')
      .mockResolvedValue(userDB as any);

    await profileExtension.setBackgroundImageURL(
      mockUser,
      'http://example.com/new-bg.png',
    );

    expect(profileExtension.getUser).toHaveBeenCalledWith(mockUser);
    expect(userDB.backgroundImageURL).toBe('http://example.com/new-bg.png');
    expect(profileExtension.db.userRepository.save).toHaveBeenCalledWith(
      userDB,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
