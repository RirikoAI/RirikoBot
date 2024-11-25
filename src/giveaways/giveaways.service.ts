import { Injectable } from '@nestjs/common';
import { DiscordClient } from '#discord/discord.client';
import { GiveawaysManager } from 'discord-giveaways';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class GiveawaysService {
  manager: GiveawaysManager;

  public register(client: DiscordClient): GiveawaysManager {
    const manager = new GiveawaysManager(client, {
      storage: './giveaways.json',
      default: {
        botsCanWin: false,
        embedColor: '#FF0000',
        embedColorEnd: '#000000',
        reaction: '🎉',
      },
    });
    this.manager = manager;
    return manager;
  }
}
