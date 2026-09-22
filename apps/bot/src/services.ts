import {
  createDatabaseClient,
  UserRepository,
  EconomyRepository,
  XpRepository,
  GuildSettingsRepository,
  LeaderboardRepository,
  ItemRepository,
  InventoryRepository,
  PlayerEnergyRepository,
  MusicRepository,
  AiRepository,
  ModerationRepository,
  StreamRepository,
  FreeGameRepository,
  GiveawayRepository,
  AutoVoiceRepository,
  WaifuAssetRepository,
  WaifuCardRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  DungeonSeasonRepository,
  DungeonFloorRepository,
  DungeonBossRepository,
  UserDungeonProgressRepository,
  CardTradeRepository,
  MarketListingRepository,
  WaifuGuildRepository,
  AchievementRepository,
  TcgConfigRepository,
  ReactionRoleRepository,
  AutoRoleRepository,
  type DatabaseClient,
} from '@ririko/database';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonStyle,
  type Client,
} from 'discord.js';
import { MusicPlayerService } from '@ririko/music';
import {
  ConversationManager,
  PersonalityEngine,
  ToolRegistry,
  ToolSecurityInterceptor,
  MediatedToolExecutor,
  FallbackChainManager,
  GeminiProvider,
  OpenAIProvider,
  OllamaProvider,
  TimeTool,
  CoinFlipTool,
  AnimeSearchTool,
  ReminderTool,
  MusicPlayTool,
  EconomyBalanceTool,
} from '@ririko/ai';
import { EventBus, resolveResetSchedulesFromEnv } from '@ririko/core';
import {
  EconomyService,
  BankingService,
  DailyService,
  LevelingService,
  LeaderboardService,
  InventoryService,
  ProfileBackgroundManager,
  ProfileCardRenderer,
  AntiSpamEvaluator,
  VoiceSessionAccumulator,
  PermissionService,
  ModerationActionService,
  ModerationLogService,
  DisciplinaryHistoryService,
  WarningEscalationService,
  PurgeService,
  AutoModService,
  AntiRaidService,
  StreamWatcherEngine,
  StreamNotificationDispatcher,
  TwitchStreamAdapter,
  YouTubeStreamAdapter,
  TikTokStreamAdapter,
  FreeGamesEngine,
  EpicGamesProvider,
  SteamFreeGamesProvider,
  GiveawayEngine,
  AutoVoiceService,
  MiniGameSessionManager,
  GameEscrowService,
  TicTacToeEngine,
  RpsEngine,
  DropManager,
  CardDismantleService,
  CardImageService,
  CombatSimulator,
  ExpeditionService,
  BossRaidService,
  PvPDuelService,
  QuestService,
  CANONICAL_ITEMS,
  EnhancementService,
  LoadoutService,
  ConsumableService,
  EnergyLifecycleService,
  createXpLevelResolver,
  TcgShopService,
  ItemGrantService,
  CraftingService,
  CardProgressionService,
  DungeonProgressService,
  BossImageService,
  ScalingEngine,
  DungeonRunner,
  TutorialService,
  DungeonLootService,
  TradeService,
  MarketService,
  WaifuGuildService,
  AchievementService,
  TcgConfigService,
  AutoRoleService,
  ReactionRoleService,
  AniListClient,
  JikanClient,
  AnimeSearchService,
  type FreeGameItem,
} from '@ririko/services';

export interface BotServices {
  db: DatabaseClient;
  eventBus: EventBus;
  userRepo: UserRepository;
  economyRepo: EconomyRepository;
  xpRepo: XpRepository;
  guildSettingsRepo: GuildSettingsRepository;
  leaderboardRepo: LeaderboardRepository;
  itemRepo: ItemRepository;
  inventoryRepo: InventoryRepository;
  playerEnergyRepo: PlayerEnergyRepository;
  musicRepo: MusicRepository;
  aiRepo: AiRepository;
  moderationRepo: ModerationRepository;
  streamRepo: StreamRepository;
  freeGameRepo: FreeGameRepository;
  giveawayRepo: GiveawayRepository;
  autoVoiceRepo: AutoVoiceRepository;
  autoVoiceService: AutoVoiceService;
  streamWatcher: StreamWatcherEngine;
  streamDispatcher: StreamNotificationDispatcher | undefined;
  freeGamesEngine: FreeGamesEngine;
  giveawayEngine: GiveawayEngine;
  gameSessionManager: MiniGameSessionManager;
  gameEscrowService: GameEscrowService;
  tictactoeEngine: TicTacToeEngine;
  rpsEngine: RpsEngine;
  musicPlayer: MusicPlayerService;
  economyService: EconomyService;
  bankingService: BankingService;
  dailyService: DailyService;
  levelingService: LevelingService;
  leaderboardService: LeaderboardService;
  inventoryService: InventoryService;
  profileBackgroundManager: ProfileBackgroundManager;
  profileCardRenderer: ProfileCardRenderer;
  antiSpamEvaluator: AntiSpamEvaluator;
  voiceAccumulator: VoiceSessionAccumulator;
  conversationManager: ConversationManager;
  personalityEngine: PersonalityEngine;
  toolRegistry: ToolRegistry;
  /** Shared AniList client; one per process so every caller shares the AniList rate limit. */
  anilistClient: AniListClient;
  /** MyAnimeList-first anime/manga/character search with AniList fallback and caching. */
  animeSearchService: AnimeSearchService;
  securityInterceptor: ToolSecurityInterceptor;
  toolExecutor: MediatedToolExecutor;
  fallbackChainManager: FallbackChainManager;
  permissionService: PermissionService;
  moderationActionService: ModerationActionService;
  moderationLogService: ModerationLogService;
  disciplinaryHistoryService: DisciplinaryHistoryService;
  warningEscalationService: WarningEscalationService;
  purgeService: PurgeService;
  autoModService: AutoModService;
  antiRaidService: AntiRaidService;
  waifuAssetRepo: WaifuAssetRepository;
  waifuCardRepo: WaifuCardRepository;
  dropManager: DropManager;
  dismantleService: CardDismantleService;
  cardImageService: CardImageService;
  bossImageService: BossImageService;
  combatSimulator: CombatSimulator;
  expeditionService: ExpeditionService;
  bossRaidService: BossRaidService;
  pvpDuelService: PvPDuelService;
  questService: QuestService;
  gameItemRepo: GameItemRepository;
  userInventoryItemRepo: UserInventoryItemRepository;
  enhancementService: EnhancementService;
  loadoutService: LoadoutService;
  consumableService: ConsumableService;
  energyLifecycleService: EnergyLifecycleService;
  tcgShopService: TcgShopService;
  craftingService: CraftingService;
  dungeonSeasonRepo: DungeonSeasonRepository;
  dungeonFloorRepo: DungeonFloorRepository;
  dungeonBossRepo: DungeonBossRepository;
  userDungeonProgressRepo: UserDungeonProgressRepository;
  scalingEngine: ScalingEngine;
  dungeonRunner: DungeonRunner;
  tutorialService: TutorialService;
  dungeonLootService: DungeonLootService;
  cardTradeRepo: CardTradeRepository;
  marketRepo: MarketListingRepository;
  tradeService: TradeService;
  marketService: MarketService;
  waifuGuildRepo: WaifuGuildRepository;
  achievementRepo: AchievementRepository;
  tcgConfigRepo: TcgConfigRepository;
  waifuGuildService: WaifuGuildService;
  achievementService: AchievementService;
  tcgConfigService: TcgConfigService;
  reactionRoleRepo: ReactionRoleRepository;
  autoRoleRepo: AutoRoleRepository;
  reactionRoleService: ReactionRoleService;
  autoRoleService: AutoRoleService;
}

/**
 * Initializes and wires all core repositories, services, and event buses for the Discord bot.
 */
export async function createBotServices(
  customDb?: DatabaseClient,
  discordClient?: Client,
): Promise<BotServices> {
  const eventBus = new EventBus();

  // Shared calendar-day reset boundary (default 00:00 GMT+8) for every daily system.
  const { schedules: resetSchedules, config: resetConfig } = resolveResetSchedulesFromEnv();

  const db =
    customDb ??
    (await createDatabaseClient({
      dialect: (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite',
      url: process.env.DATABASE_URL || 'sqlite:storage/ririko.db',
    }));

  // Repositories
  const userRepo = new UserRepository(db);
  const economyRepo = new EconomyRepository(db);
  const xpRepo = new XpRepository(db);
  const guildSettingsRepo = new GuildSettingsRepository(db);
  const leaderboardRepo = new LeaderboardRepository(db);
  const itemRepo = new ItemRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const playerEnergyRepo = new PlayerEnergyRepository(db, resetSchedules.energyPotions);
  const musicRepo = new MusicRepository(db);
  const streamRepo = new StreamRepository(db);
  const freeGameRepo = new FreeGameRepository(db);
  const autoVoiceRepo = new AutoVoiceRepository(db);
  const autoVoiceService = new AutoVoiceService(autoVoiceRepo);
  const waifuAssetRepo = new WaifuAssetRepository(db);
  const waifuCardRepo = new WaifuCardRepository(db);
  const reactionRoleRepo = new ReactionRoleRepository(db);
  const autoRoleRepo = new AutoRoleRepository(db);
  const reactionRoleService = new ReactionRoleService(reactionRoleRepo);
  const autoRoleService = new AutoRoleService(autoRoleRepo);
  const dropManager = new DropManager(waifuCardRepo, waifuAssetRepo);
  const gameItemRepo = new GameItemRepository(db);
  const userInventoryItemRepo = new UserInventoryItemRepository(db);
  const itemGrantService = new ItemGrantService(gameItemRepo, userInventoryItemRepo);
  const dismantleService = new CardDismantleService(waifuCardRepo, userInventoryItemRepo, itemGrantService);
  const cardImageService = new CardImageService();
  const bossImageService = new BossImageService(waifuAssetRepo);
  const musicPlayer = new MusicPlayerService({
    youtubeOptions: {
      cookie: process.env.YOUTUBE_COOKIE,
      poToken: process.env.YOUTUBE_PO_TOKEN,
      visitorData: process.env.YOUTUBE_VISITOR_DATA,
    },
    lavalink: {
      enabled: process.env.LAVALINK_ENABLED !== 'false',
      node: {
        host: process.env.LAVALINK_HOST || '127.0.0.1',
        port: parseInt(process.env.LAVALINK_PORT || '2333', 10),
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: process.env.LAVALINK_SECURE === 'true',
      },
    },
  });

  // Seed default shop catalog if empty
  await itemRepo.seedDefaultCatalog().catch(() => {});

  // Services
  const bankingService = new BankingService({
    repository: economyRepo,
    baseCapacity: 10000,
    capacityPerLevel: 2500,
  });

  const dailyService = new DailyService({
    repository: economyRepo,
    baseReward: 250,
    streakBonusPercent: 0.05,
    maxStreakBonusPercent: 1.5,
    resetSchedule: resetSchedules.daily,
    streakForgiveness: resetConfig.RIRIKO_DAILY_STREAK_FORGIVENESS,
  });

  const levelingService = new LevelingService({
    xpRepository: xpRepo,
    userRepository: userRepo,
    guildSettingsRepository: guildSettingsRepo,
    bankingService,
    eventBus,
  });

  // Energy lifecycle owns the daily boundary and level-scaled capacity. It resolves the
  // player's account-wide level from summed XP, since energy is global while xp_accounts
  // is per guild.
  const energyLifecycleService = new EnergyLifecycleService(playerEnergyRepo, {
    resetSchedule: resetSchedules.energy,
    levelResolver: createXpLevelResolver(
      xpRepo,
      (totalXp) => levelingService.getLevelProgress(totalXp).level,
    ),
  });

  const leaderboardService = new LeaderboardService({
    xpRepository: xpRepo,
    leaderboardRepository: leaderboardRepo,
    config: {
      snapshotTtlMs: 10 * 60 * 1000, // 10 minutes
      autoRefresh: false,
    },
  });

  const inventoryService = new InventoryService({
    itemRepository: itemRepo,
    inventoryRepository: inventoryRepo,
    economyRepository: economyRepo,
    playerEnergyRepository: playerEnergyRepo,
    levelingService,
    eventBus,
    resetSchedule: resetSchedules.shopPurchases,
    energyLifecycle: energyLifecycleService,
  });

  const profileBackgroundManager = new ProfileBackgroundManager({
    userRepository: userRepo,
    inventoryService,
  });

  const profileCardRenderer = new ProfileCardRenderer({
    userRepository: userRepo,
    economyRepository: economyRepo,
    levelingService,
    bankingService,
    leaderboardService,
  });

  const antiSpamEvaluator = new AntiSpamEvaluator({
    cooldownSeconds: 60,
    minContentLength: 5,
    similarityThreshold: 0.8,
  });

  const economyService = new EconomyService({
    repository: economyRepo,
    eventBus,
    antiSpam: antiSpamEvaluator,
  });

  const voiceAccumulator = new VoiceSessionAccumulator({
    economyService,
    config: {
      minQuorum: 2,
      intervalSeconds: 60,
    },
  });

  const aiRepo = new AiRepository(db);
  const conversationManager = new ConversationManager({ repository: aiRepo });
  const personalityEngine = new PersonalityEngine();
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new TimeTool());
  toolRegistry.register(new CoinFlipTool());
  // Interactive callers (AI chat, commands) fail fast instead of using the batch retry defaults.
  const anilistClient = new AniListClient({ maxRetries: 1, timeoutMs: 5000 });
  // No retries: on failure the search service answers from AniList and pauses Jikan briefly.
  const animeSearchService = new AnimeSearchService({
    jikan: new JikanClient({ maxRetries: 0, timeoutMs: 5000 }),
    anilist: anilistClient,
  });
  toolRegistry.register(
    new AnimeSearchTool(async (title: string) => {
      const [media] = await anilistClient.searchMedia(title, { type: 'ANIME', perPage: 1 });
      if (!media) return null;
      return {
        title: media.title.english || media.title.romaji || media.title.native || title,
        synopsis: media.description?.slice(0, 400) || 'No description available.',
        score: media.averageScore ? media.averageScore / 10 : undefined,
        episodes: media.episodes ?? undefined,
        status: media.status ?? undefined,
        url: media.siteUrl ?? undefined,
      };
    }),
  );
  toolRegistry.register(new ReminderTool());
  toolRegistry.register(new MusicPlayTool());
  toolRegistry.register(
    new EconomyBalanceTool(async (userId: string) => {
      const bal = await economyRepo.findById(userId);
      if (!bal) return null;
      return {
        wallet: bal.walletBalance,
        bank: bal.bankBalance,
        netWorth: bal.netWorth,
      };
    }),
  );
  const securityInterceptor = new ToolSecurityInterceptor(toolRegistry);
  const toolExecutor = new MediatedToolExecutor(toolRegistry, securityInterceptor);

  const defaultAiProvider = (
    process.env.DEFAULT_AI_PROVIDER ||
    process.env.AI_PROVIDER ||
    'gemini'
  ).toLowerCase();

  const aiProviders = [];
  if (process.env.GEMINI_API_KEY) {
    aiProviders.push(
      new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        defaultModel: defaultAiProvider === 'gemini' ? process.env.DEFAULT_AI_MODEL : undefined,
      }),
    );
  }
  if (process.env.OPENAI_API_KEY) {
    aiProviders.push(
      new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
        defaultModel: defaultAiProvider === 'openai' ? process.env.DEFAULT_AI_MODEL : undefined,
      }),
    );
  }
  aiProviders.push(
    new OllamaProvider({
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: defaultAiProvider === 'ollama' ? process.env.DEFAULT_AI_MODEL : undefined,
    }),
  );
  const fallbackChainManager = new FallbackChainManager(aiProviders, {
    defaultProviderId: defaultAiProvider,
  });

  // Moderation Subsystems
  const moderationRepo = new ModerationRepository(db);
  const permissionService = new PermissionService(guildSettingsRepo);
  const moderationActionService = new ModerationActionService(
    permissionService,
    moderationRepo,
    eventBus,
  );
  const moderationLogService = new ModerationLogService(
    moderationRepo,
    guildSettingsRepo,
    eventBus,
  );
  const disciplinaryHistoryService = new DisciplinaryHistoryService(moderationRepo);
  const warningEscalationService = new WarningEscalationService(
    moderationRepo,
    permissionService,
    moderationActionService,
    eventBus,
  );
  const purgeService = new PurgeService(
    permissionService,
    moderationRepo,
    eventBus,
  );
  const autoModService = new AutoModService(
    moderationRepo,
    moderationActionService,
    warningEscalationService,
    eventBus,
  );
  const antiRaidService = new AntiRaidService(
    moderationRepo,
    moderationActionService,
    eventBus,
  );

  const streamDispatcher = discordClient
    ? new StreamNotificationDispatcher(discordClient, streamRepo)
    : undefined;

  const streamWatcher = new StreamWatcherEngine(streamRepo, {
    checkIntervalMs: Number(process.env.STREAM_CHECK_INTERVAL_MS || 60_000),
    onStreamLive: async (streamer, stream) => {
      if (streamDispatcher) {
        await streamDispatcher.dispatch(streamer, stream);
      }
    },
  });

  streamWatcher.registerAdapter(
    new TwitchStreamAdapter({
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
    }),
  );
  streamWatcher.registerAdapter(
    new YouTubeStreamAdapter({
      apiKey: process.env.YOUTUBE_API_KEY,
    }),
  );
  streamWatcher.registerAdapter(
    new TikTokStreamAdapter({
      sessionId: process.env.TIKTOK_SESSION_ID,
      apiKey: process.env.TIKTOK_API_KEY,
    }),
  );

  const freeGamesEngine: FreeGamesEngine = new FreeGamesEngine(freeGameRepo, {
    providers: [new EpicGamesProvider(), new SteamFreeGamesProvider()],
    onAnnounceGame: async (
      _guildId: string,
      channelId: string,
      game: FreeGameItem,
    ): Promise<string | null> => {
      if (!discordClient) return null;
      try {
        const channel = await discordClient.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased() && 'send' in channel) {
          const embed = freeGamesEngine.formatGameEmbed(game);
          const msg = await (channel as any).send({ embeds: [embed] });
          return (msg?.id as string) ?? null;
        }
      } catch (err) {
        console.error(`[FreeGamesEngine] Failed to post alert in channel ${channelId}:`, err);
      }
      return null;
    },
    getGuildAnnounceTargets: async () => {
      return freeGameRepo.listAllConfiguredGuildChannels();
    },
  });

  // Giveaways Engine
  const giveawayRepo = new GiveawayRepository(db);
  const giveawayEngine: GiveawayEngine = new GiveawayEngine(giveawayRepo, {
    onGiveawayEnded: async (result) => {
      if (!discordClient) return;
      try {
        const giveaway = result.giveaway;
        const channel = await discordClient.channels.fetch(giveaway.channelId).catch(() => null);
        if (channel && channel.isTextBased() && 'messages' in channel) {
          const msg = await (channel as any).messages.fetch(giveaway.messageId).catch(() => null);
          const entryCount = await giveawayRepo.getEntryCount(giveaway.id);
          const embedData = giveawayEngine.formatGiveawayEmbed(giveaway, entryCount, result.winnerIds);
          const buttonData = giveawayEngine.formatGiveawayButton(giveaway.id, true, entryCount);
          const embed = new EmbedBuilder(embedData);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buttonData.customId)
              .setLabel(buttonData.label)
              .setStyle(buttonData.style as ButtonStyle)
              .setDisabled(true)
              .setEmoji(buttonData.emoji),
          );
          if (msg) {
            await msg.edit({ embeds: [embed], components: [row] }).catch(() => null);
          }

          const winnerText = result.winnerIds.length > 0
            ? result.winnerIds.map((id) => `<@${id}>`).join(', ')
            : 'None (No eligible entries)';
          if (result.winnerIds.length > 0) {
            await (channel as any).send({
              content: `🎉 Congratulations ${winnerText}! You won **${giveaway.prize}**!\n${msg ? msg.url : ''}`,
            }).catch(() => null);
          } else {
            await (channel as any).send({
              content: `⚠️ Giveaway for **${giveaway.prize}** has ended with no eligible winners.`,
            }).catch(() => null);
          }
        }
      } catch (err) {
        console.error(`[GiveawayEngine] onGiveawayEnded failed for ${result.giveaway.id}:`, err);
      }
    },
  });

  const gameSessionManager = new MiniGameSessionManager();
  const gameEscrowService = new GameEscrowService(economyRepo);
  const tictactoeEngine = new TicTacToeEngine(gameSessionManager);
  const rpsEngine = new RpsEngine(gameSessionManager);
  const combatSimulator = new CombatSimulator({ maxTurns: 25 });
  const rewardPayout = { economyRepo, grants: itemGrantService };
  const expeditionService = new ExpeditionService(playerEnergyRepo, rewardPayout, energyLifecycleService);
  const bossRaidService = new BossRaidService(
    playerEnergyRepo,
    combatSimulator,
    rewardPayout,
    energyLifecycleService,
  );
  const pvpDuelService = new PvPDuelService(
    playerEnergyRepo,
    economyRepo,
    combatSimulator,
    energyLifecycleService,
  );
  const questService = new QuestService();

  const enhancementService = new EnhancementService(gameItemRepo, userInventoryItemRepo);
  const loadoutService = new LoadoutService(gameItemRepo, userInventoryItemRepo, waifuCardRepo, enhancementService);
  const consumableService = new ConsumableService(
    gameItemRepo,
    userInventoryItemRepo,
    playerEnergyRepo,
    energyLifecycleService,
  );
  const tcgShopService = new TcgShopService(
    gameItemRepo,
    userInventoryItemRepo,
    economyRepo,
    resetSchedules.tcgShop,
  );

  const dungeonSeasonRepo = new DungeonSeasonRepository(db);
  const dungeonFloorRepo = new DungeonFloorRepository(db);
  const dungeonBossRepo = new DungeonBossRepository(db);
  const userDungeonProgressRepo = new UserDungeonProgressRepository(db);
  const craftingService = new CraftingService(
    gameItemRepo,
    userInventoryItemRepo,
    economyRepo,
    userDungeonProgressRepo,
    dungeonSeasonRepo,
    db,
  );
  const scalingEngine = new ScalingEngine();
  const dungeonLootService = new DungeonLootService({
    economyRepo,
    inventoryRepo: userInventoryItemRepo,
    itemRepo: gameItemRepo,
    xpRepo,
  });

  const cardTradeRepo = new CardTradeRepository(db);
  const marketRepo = new MarketListingRepository(db);
  const tradeService = new TradeService(cardTradeRepo, waifuCardRepo, economyRepo, db, userInventoryItemRepo);
  const marketService = new MarketService(marketRepo, waifuCardRepo, economyRepo, db, userInventoryItemRepo);

  const waifuGuildRepo = new WaifuGuildRepository(db);
  const achievementRepo = new AchievementRepository(db);
  const tcgConfigRepo = new TcgConfigRepository(db);

  const waifuGuildService = new WaifuGuildService(waifuGuildRepo, economyRepo, db);
  const achievementService = new AchievementService(achievementRepo, economyRepo, db, {
    xpRepo,
    inventoryRepo: userInventoryItemRepo,
    itemRepo: gameItemRepo,
    waifuCardRepo,
  });
  const tcgConfigService = new TcgConfigService(tcgConfigRepo);

  // Seed default achievements if needed
  try {
    await achievementService.seedAchievements();
  } catch {
    // In some unit tests with isolated in-memory databases, tables may not exist yet
  }

  const tutorialService = new TutorialService(userDungeonProgressRepo, {
    cardRepo: waifuCardRepo,
    inventoryRepo: userInventoryItemRepo,
    itemRepo: gameItemRepo,
    assetRepo: waifuAssetRepo,
    tcgConfigRepo,
    achievementService,
  });
  const dungeonRunner = new DungeonRunner(playerEnergyRepo, userDungeonProgressRepo, {
    energyLifecycle: energyLifecycleService,
    scalingEngine,
    floorRepo: dungeonFloorRepo,
    bossRepo: dungeonBossRepo,
    seasonRepo: dungeonSeasonRepo,
    lootService: dungeonLootService,
    cardRepo: waifuCardRepo,
    tutorialService,
    cardProgression: new CardProgressionService(waifuCardRepo),
    progressService: new DungeonProgressService(tcgConfigRepo, playerEnergyRepo, itemGrantService),
  });

  // Seed canonical items if needed
  try {
    for (const item of CANONICAL_ITEMS) {
      const exists = await gameItemRepo.findByCode(item.code);
      if (!exists) {
        await gameItemRepo.create(item);
      }
    }
    // Rows written by older reward code point at ids that never existed in game_items.
    const repaired = await itemGrantService.repairLegacyInventoryRows();
    if (repaired > 0) console.log(`[tcg] Repaired ${repaired} legacy inventory item row(s).`);
  } catch {
    // In some unit tests with isolated in-memory databases, game_items may not be created.
  }

  // Seed default seasons if needed
  try {
    const active = await dungeonSeasonRepo.findActiveSeason();
    if (!active) {
      await dungeonSeasonRepo.create({
        id: 's1_infernal_crucible',
        name: 'Season 1: Infernal Crucible',
        description: 'Blistering magma towers with Scorched Earth and Heat Haze affixes.',
        isActive: true,
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
        scalingModel: 'EXPONENTIAL',
        isTutorial: false,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    }
    const tutorialSeason = await dungeonSeasonRepo.findTutorialSeason();
    if (!tutorialSeason) {
      await dungeonSeasonRepo.create({
        id: 'season_tutorial',
        name: 'Tutorial Prologue: Training Grounds',
        description: 'Introductory 4-floor training dungeon teaching basic mechanics and wards.',
        isActive: true,
        themeElement: 'NEUTRAL',
        seasonalAffixes: [],
        scalingModel: 'LINEAR',
        isTutorial: true,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      });
    }
  } catch {
    // Ignore in tests
  }

  return {
    db,
    eventBus,
    userRepo,
    economyRepo,
    xpRepo,
    guildSettingsRepo,
    leaderboardRepo,
    itemRepo,
    inventoryRepo,
    playerEnergyRepo,
    musicRepo,
    aiRepo,
    moderationRepo,
    streamRepo,
    freeGameRepo,
    giveawayRepo,
    autoVoiceRepo,
    autoVoiceService,
    streamWatcher,
    streamDispatcher,
    freeGamesEngine,
    giveawayEngine,
    gameSessionManager,
    gameEscrowService,
    tictactoeEngine,
    rpsEngine,
    musicPlayer,
    economyService,
    bankingService,
    dailyService,
    levelingService,
    leaderboardService,
    inventoryService,
    profileBackgroundManager,
    profileCardRenderer,
    antiSpamEvaluator,
    voiceAccumulator,
    conversationManager,
    personalityEngine,
    toolRegistry,
    anilistClient,
    animeSearchService,
    securityInterceptor,
    toolExecutor,
    fallbackChainManager,
    permissionService,
    moderationActionService,
    moderationLogService,
    disciplinaryHistoryService,
    warningEscalationService,
    purgeService,
    autoModService,
    antiRaidService,
    waifuAssetRepo,
    waifuCardRepo,
    dropManager,
    dismantleService,
    cardImageService,
    bossImageService,
    combatSimulator,
    expeditionService,
    bossRaidService,
    pvpDuelService,
    questService,
    gameItemRepo,
    userInventoryItemRepo,
    enhancementService,
    loadoutService,
    consumableService,
    energyLifecycleService,
    tcgShopService,
    craftingService,
    dungeonSeasonRepo,
    dungeonFloorRepo,
    dungeonBossRepo,
    userDungeonProgressRepo,
    scalingEngine,
    dungeonRunner,
    tutorialService,
    dungeonLootService,
    cardTradeRepo,
    marketRepo,
    tradeService,
    marketService,
    waifuGuildRepo,
    achievementRepo,
    tcgConfigRepo,
    waifuGuildService,
    achievementService,
    tcgConfigService,
    reactionRoleRepo,
    autoRoleRepo,
    reactionRoleService,
    autoRoleService,
  };
}
