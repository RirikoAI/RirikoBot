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
  type DatabaseClient,
} from '@ririko/database';
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
  };
}
