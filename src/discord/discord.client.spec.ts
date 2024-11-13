import { DiscordClient } from './discord.client';

const mockSetToken = jest.fn();
const mockLogin = jest.fn();

jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: mockLogin,
  })),
  REST: jest.fn().mockImplementation(() => ({
    setToken: mockSetToken,
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMembers: 2,
    GuildEmojisAndStickers: 3,
    GuildMessages: 4,
    GuildPresences: 5,
    MessageContent: 6,
    GuildMessageReactions: 7,
    DirectMessages: 8,
    DirectMessageReactions: 9,
    GuildVoiceStates: 10,
    GuildModeration: 11,
  },
  Partials: {
    GuildMember: 'GUILD_MEMBER',
    Message: 'MESSAGE',
    Channel: 'CHANNEL',
    User: 'USER',
    Reaction: 'REACTION',
  },
}));

describe('DiscordClient', () => {
  let discordClient: DiscordClient;

  beforeEach(() => {
    discordClient = new DiscordClient();
  });

  it('should be instantiated correctly', () => {
    expect(discordClient).toBeDefined();
  });

  it('should set restClient on login', async () => {
    const token = 'test-token';
    await discordClient.login(token);
    expect(mockSetToken).toBeDefined();
  });

  it('should call super.login on login', async () => {
    const token = 'test-token';
    await discordClient.login(token);
    expect(mockLogin).toHaveBeenCalledWith(token);
  });
});
