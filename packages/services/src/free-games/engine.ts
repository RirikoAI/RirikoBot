import type { FreeGameRepository } from '@ririko/database';
import type { FreeGameItem, FreeGameProvider, FreeGameProviderType } from './types.js';

export interface FreeGamesEngineOptions {
  checkIntervalMs?: number;
  providers?: FreeGameProvider[];
  onAnnounceGame?: (
    guildId: string,
    channelId: string,
    game: FreeGameItem,
  ) => Promise<string | null | void>; // Returns message ID if sent
  getGuildAnnounceTargets?: () => Promise<Array<{ guildId: string; channelId: string }>>;
}

export class FreeGamesEngine {
  private readonly providers = new Map<FreeGameProviderType, FreeGameProvider>();
  private readonly checkIntervalMs: number;
  private readonly onAnnounceGame?:
    | ((guildId: string, channelId: string, game: FreeGameItem) => Promise<string | null | void>)
    | undefined;
  private readonly getGuildAnnounceTargets?:
    | (() => Promise<Array<{ guildId: string; channelId: string }>>)
    | undefined;

  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private readonly freeGameRepo: FreeGameRepository,
    options: FreeGamesEngineOptions = {},
  ) {
    this.checkIntervalMs = options.checkIntervalMs ?? 30 * 60_000; // 30 minutes default
    this.onAnnounceGame = options.onAnnounceGame;
    this.getGuildAnnounceTargets = options.getGuildAnnounceTargets;

    if (options.providers) {
      for (const provider of options.providers) {
        this.registerProvider(provider);
      }
    }
  }

  registerProvider(provider: FreeGameProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  getProvider(id: FreeGameProviderType): FreeGameProvider | undefined {
    return this.providers.get(id);
  }

  start(): void {
    if (this.timer) return;

    // Small delay before initial fetch
    setTimeout(() => {
      void this.checkAndAnnounce();
    }, 2_000);

    this.timer = setInterval(() => {
      void this.checkAndAnnounce();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollFreeGames(): Promise<FreeGameItem[]> {
    const allGames: FreeGameItem[] = [];

    for (const provider of this.providers.values()) {
      try {
        const games = await provider.fetchFreeGames();
        for (const game of games) {
          allGames.push(game);

          // Save active free games to database
          if (!game.isUpcoming) {
            await this.freeGameRepo.upsertFreeGame({
              id: game.id,
              provider: game.provider,
              title: game.title,
              storeUrl: game.storeUrl,
              thumbnailUrl: game.thumbnailUrl,
              startDate: game.startDate,
              endDate: game.endDate,
            });
          }
        }
      } catch (err) {
        console.error(`[FreeGamesEngine] Error polling provider ${provider.name}:`, err);
      }
    }

    return allGames;
  }

  async checkAndAnnounce(): Promise<{ discovered: number; announced: number }> {
    if (this.isChecking) return { discovered: 0, announced: 0 };
    this.isChecking = true;

    try {
      const games = await this.pollFreeGames();
      const activeGames = games.filter((g) => !g.isUpcoming);

      if (!this.onAnnounceGame || !this.getGuildAnnounceTargets || activeGames.length === 0) {
        return { discovered: activeGames.length, announced: 0 };
      }

      const targets = await this.getGuildAnnounceTargets();
      let announcedCount = 0;

      for (const target of targets) {
        for (const game of activeGames) {
          try {
            const alreadyAnnounced = await this.freeGameRepo.isGameAnnounced(
              game.id,
              target.guildId,
            );
            if (alreadyAnnounced) continue;

            const messageId = await this.onAnnounceGame(target.guildId, target.channelId, game);
            if (messageId) {
              await this.freeGameRepo.recordAnnouncement({
                gameId: game.id,
                guildId: target.guildId,
                channelId: target.channelId,
                messageId: String(messageId),
              });
              announcedCount++;
            }
          } catch (err) {
            console.error(
              `[FreeGamesEngine] Failed announcing game ${game.id} to guild ${target.guildId}:`,
              err,
            );
          }
        }
      }

      return { discovered: activeGames.length, announced: announcedCount };
    } finally {
      this.isChecking = false;
    }
  }

  formatGameEmbed(game: FreeGameItem) {
    const providerColor =
      game.provider === 'EPIC' ? 0x0078f2 : game.provider === 'STEAM' ? 0x1b2838 : 0x8a2be2;

    const endTimestamp = Math.floor(game.endDate.getTime() / 1000);
    const startTimestamp = Math.floor(game.startDate.getTime() / 1000);

    const descriptionParts = [
      `**[Claim on ${game.provider === 'EPIC' ? 'Epic Games' : 'Steam'}](${game.storeUrl})**`,
      '',
    ];

    if (game.originalPrice) {
      descriptionParts.push(`💰 **Original Price:** ~~${game.originalPrice}~~ **FREE!**`);
    }

    if (game.isUpcoming) {
      descriptionParts.push(`⏳ **Available On:** <t:${startTimestamp}:f> (<t:${startTimestamp}:R>)`);
    } else {
      descriptionParts.push(`⏰ **Claim Before:** <t:${endTimestamp}:f> (<t:${endTimestamp}:R>)`);
    }

    return {
      title: `🎮 Free Game: ${game.title}`,
      url: game.storeUrl,
      description: descriptionParts.join('\n'),
      color: providerColor,
      thumbnail: game.thumbnailUrl ? { url: game.thumbnailUrl } : undefined,
      image: game.thumbnailUrl ? { url: game.thumbnailUrl } : undefined,
      footer: {
        text: `Free on ${game.provider} • Ririko AI`,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
