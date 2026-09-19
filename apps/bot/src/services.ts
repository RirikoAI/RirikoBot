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
  UserDungeonProgressRepository,
  CardTradeRepository,
  MarketListingRepository,
  WaifuGuildRepository,
  AchievementRepository,
  TcgConfigRepository,
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
import { EventBus } from '@ririko/core';
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
  TcgShopService,
  ScalingEngine,
  DungeonRunner,
  TutorialService,
  DungeonLootService,
  TradeService,
  MarketService,
  WaifuGuildService,
  AchievementService,
  TcgConfigService,
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
  dungeonSeasonRepo: DungeonSeasonRepository;
  dungeonFloorRepo: DungeonFloorRepository;
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
}

/**
 * Initializes and wires all core repositories, services, and event buses for the Discord bot.
 */
export async function createBotServices(
  customDb?: DatabaseClient,
  discordClient?: Client,
): Promise<BotServices> {
  const eventBus = new EventBus();

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
  const playerEnergyRepo = new PlayerEnergyRepository(db);
  const musicRepo = new MusicRepository(db);
  const streamRepo = new StreamRepository(db);
  const freeGameRepo = new FreeGameRepository(db);
  const autoVoiceRepo = new AutoVoiceRepository(db);
  const autoVoiceService = new AutoVoiceService(autoVoiceRepo);
  const waifuAssetRepo = new WaifuAssetRepository(db);
  const waifuCardRepo = new WaifuCardRepository(db);
  const dropManager = new DropManager(waifuCardRepo, waifuAssetRepo);
  const dismantleService = new CardDismantleService(waifuCardRepo);
  const cardImageService = new CardImageService();
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
    cooldownWindowMs: 24 * 3600 * 1000,
    graceWindowMs: 12 * 3600 * 1000,
  });

  const levelingService = new LevelingService({
    xpRepository: xpRepo,
    userRepository: userRepo,
    guildSettingsRepository: guildSettingsRepo,
    bankingService,
    eventBus,
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
  toolRegistry.register(new AnimeSearchTool());
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
  const expeditionService = new ExpeditionService(playerEnergyRepo);
  const bossRaidService = new BossRaidService(playerEnergyRepo, combatSimulator);
  const pvpDuelService = new PvPDuelService(playerEnergyRepo, economyRepo, combatSimulator);
  const questService = new QuestService();

  const gameItemRepo = new GameItemRepository(db);
  const userInventoryItemRepo = new UserInventoryItemRepository(db);
  const enhancementService = new EnhancementService(gameItemRepo, userInventoryItemRepo);
  const loadoutService = new LoadoutService(gameItemRepo, userInventoryItemRepo, waifuCardRepo, enhancementService);
  const consumableService = new ConsumableService(gameItemRepo, userInventoryItemRepo, playerEnergyRepo);
  const energyLifecycleService = new EnergyLifecycleService(playerEnergyRepo);
  const tcgShopService = new TcgShopService(gameItemRepo, userInventoryItemRepo, economyRepo);

  const dungeonSeasonRepo = new DungeonSeasonRepository(db);
  const dungeonFloorRepo = new DungeonFloorRepository(db);
  const userDungeonProgressRepo = new UserDungeonProgressRepository(db);
  const scalingEngine = new ScalingEngine();
  const dungeonLootService = new DungeonLootService({
    economyRepo,
    inventoryRepo: userInventoryItemRepo,
    xpRepo,
  });

  const cardTradeRepo = new CardTradeRepository(db);
  const marketRepo = new MarketListingRepository(db);
  const tradeService = new TradeService(cardTradeRepo, waifuCardRepo, economyRepo, db);
  const marketService = new MarketService(marketRepo, waifuCardRepo, economyRepo, db);

  const waifuGuildRepo = new WaifuGuildRepository(db);
  const achievementRepo = new AchievementRepository(db);
  const tcgConfigRepo = new TcgConfigRepository(db);

  const waifuGuildService = new WaifuGuildService(waifuGuildRepo, economyRepo, db);
  const achievementService = new AchievementService(achievementRepo, economyRepo, db, {
    xpRepo,
    inventoryRepo: userInventoryItemRepo,
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
    scalingEngine,
    floorRepo: dungeonFloorRepo,
    seasonRepo: dungeonSeasonRepo,
    lootService: dungeonLootService,
    cardRepo: waifuCardRepo,
    tutorialService,
  });

  // Seed canonical items if needed
  try {
    for (const item of CANONICAL_ITEMS) {
      const exists = await gameItemRepo.findByCode(item.code);
      if (!exists) {
        await gameItemRepo.create(item);
      }
    }
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
    dungeonSeasonRepo,
    dungeonFloorRepo,
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
  };
}
