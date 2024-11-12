import { Client, GatewayIntentBits, Partials, REST } from 'discord.js';

/**
 * Discord Client
 * @author Earnest Angel (https://angel.net.my)
 */
export class DiscordClient extends Client {
  restClient: REST;

  constructor(...opt: any[]) {
    super({
      ...opt,
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: true,
      },
      partials: [
        Partials.GuildMember,
        Partials.Message,
        Partials.Channel,
        Partials.User,
        Partials.Reaction,
      ],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
      ],
    });
  }

  async login(token?: string): Promise<string> {
    this.restClient = new REST().setToken(token);
    return super.login(token);
  }

  on: any;
}
