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
  type DatabaseClient,
} from '@ririko/database';
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
}

/**
 * Initializes and wires all core repositories, services, and event buses for the Discord bot.
 */
export async function createBotServices(customDb?: DatabaseClient): Promise<BotServices> {
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
  const toolRegistry = ToolRegistry.createDefault();
  const securityInterceptor = new ToolSecurityInterceptor(toolRegistry);
  const toolExecutor = new MediatedToolExecutor(toolRegistry, securityInterceptor);

  const aiProviders = [];
  if (process.env.GEMINI_API_KEY) {
    aiProviders.push(new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }));
  }
  if (process.env.OPENAI_API_KEY) {
    aiProviders.push(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }));
  }
  aiProviders.push(
    new OllamaProvider({ baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' }),
  );
  const fallbackChainManager = new FallbackChainManager(aiProviders);

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
  };
}
