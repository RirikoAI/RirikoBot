/// <reference types="react/experimental" />
import 'server-only';
import { REST } from '@discordjs/rest';
import { experimental_taintObjectReference, experimental_taintUniqueValue } from 'react';
import { loadWebConfig, SecretVault, type WebConfig } from '@ririko/core';
import {
  AchievementRepository,
  AuditLogRepository,
  AutoRoleRepository,
  AutoVoiceRepository,
  BotActivityRepository,
  GuildRepository,
  CommandCatalogRepository,
  CommandSettingsRepository,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  EconomyConfigRepository,
  InventoryRepository,
  ItemCategoryRepository,
  ItemRepository,
  createDatabaseClient,
  ensurePostgresSchema,
  ensureGuildRegistrySchema,
  ensureTextIdColumns,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  ModerationRepository,
  MusicRepository,
  AiRepository,
  ImageRepository,
  FreeGameRepository,
  GameItemRepository,
  WelcomerRepository,
  ReactionRoleRepository,
  StreamRepository,
  TcgConfigRepository,
  GiveawayRepository,
  UserInventoryItemRepository,
  UserRepository,
  WaifuCardRepository,
  WebKnownDeviceRepository,
  WebPasskeyRepository,
  WebSessionRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigService } from '@ririko/services/guild';
import {
  DungeonSeasonAdminService,
  EconomyConfigService,
  ItemCatalogService,
  TcgAchievementAdminService,
  TcgItemCatalogService,
  TcgRulesService,
} from '@ririko/services/owner';
import { CardAlbumService } from '@ririko/services/tcg-album';
import { createStreamAdapters, StreamAlertService } from '@ririko/services/stream-alerts';
import { WelcomerBackgroundStore } from '@ririko/services/welcomer-backgrounds';
import { DiscordOAuthClient } from './auth/discord-oauth';
import { KnownDeviceService } from './auth/known-devices';
import { PasskeyService } from './auth/passkeys';
import { SessionService } from './auth/session-service';
import { DiscordNotifier } from './discord-notifier';
import { BotGuildDirectory } from './guilds/bot-guilds';
import { GiveawayManagementService } from './guilds/giveaways';
import { GuildAccessService } from './guilds/guild-access';
import { GuildResourceDirectory } from './guilds/guild-resources';
import { ReactionRolePanelService } from './guilds/reaction-role-panels';
import { UserDirectory } from './guilds/user-directory';
import { WelcomerBackgroundService } from './guilds/welcomer-backgrounds';

/**
 * Server-side dependencies of the dashboard. Built once per process from the shared monorepo
 * configuration; never import this module from a client component.
 */
export interface WebServices {
  config: WebConfig;
  db: DatabaseClient;
  vault: SecretVault;
  oauth: DiscordOAuthClient;
  /** The same application with the bot invite callback as its redirect URI (TASK-1841). */
  inviteOauth: DiscordOAuthClient;
  sessions: SessionService;
  passkeys: PasskeyService;
  knownDevices: KnownDeviceService;
  users: UserRepository;
  /** Append-only `audit_logs` writer for account events. */
  audit: AuditLogRepository;
  /** Discord REST client authenticated with the bot token; server-side only. */
  botRest: REST;
  guildAccess: GuildAccessService;
  /** Channels and roles for pickers; only after `requireGuildAccess`. */
  guildResources: GuildResourceDirectory;
  /** Discord names for user IDs in cases and audit entries. */
  userDirectory: UserDirectory;
  /** Moderation cases, warnings and notes, for the read-only case log. */
  moderation: ModerationRepository;
  guildConfig: GuildConfigService;
  /** Publishes and edits reaction role panels (after guard and passkey step-up). */
  reactionRolePanels: ReactionRolePanelService;
  giveaways: GiveawayManagementService;
  /** Stream alert subscriptions, shared with `/stream` (after `requireGuildAccess`). */
  streamAlerts: StreamAlertService;
  /** Uploaded welcome and farewell backgrounds (after `requireGuildAccess`). */
  welcomerBackgrounds: WelcomerBackgroundService;
  /** Global economy values for the owner console (after `requireOwner` or `runOwnerAction`). */
  economyConfig: EconomyConfigService;
  /** Global item shop for the owner console (after `requireOwner` or `runOwnerAction`). */
  itemCatalog: ItemCatalogService;
  /** Global Waifu TCG rules for the owner console (after `requireOwner` or `runOwnerAction`). */
  tcgRules: TcgRulesService;
  /** Dungeon seasons and bosses for the owner console (after `requireOwner` or `runOwnerAction`). */
  dungeonSeasons: DungeonSeasonAdminService;
  /** Waifu TCG items for the owner console (after `requireOwner` or `runOwnerAction`). */
  tcgItems: TcgItemCatalogService;
  /**
   * Waifu TCG achievements: owner edits (after `requireOwner` or `runOwnerAction`) and read-only
   * guild completion counts (after `requireGuildAccess`).
   */
  tcgAchievements: TcgAchievementAdminService;
  /** The signed-in user's own card collection (after `requireSession`). */
  cardAlbum: CardAlbumService;
  /** Commands the bot recorded at startup, for the Command Overrides page; read-only here. */
  commandCatalog: CommandCatalogRepository;
  /** Command usage, bot status and voice activity written by the bot; read-only here. */
  botActivity: BotActivityRepository;
  /** The servers the bot is in, with owner and inviter, written by the bot; read-only here. */
  guildRegistry: GuildRepository;
  /** Security DMs and guild change notices (best effort). */
  notifier: DiscordNotifier;
}

/** Config keys holding credentials; long values only, as taint needs high-entropy strings. */
const SECRET_CONFIG_KEY = /TOKEN|SECRET|KEY|PASSWORD/;
const MIN_TAINTED_LENGTH = 16;

/**
 * Makes React refuse to send secrets to a Client Component (enabled by `experimental.taint`).
 * This backs up `server-only`, which already keeps these modules out of client bundles. The
 * config object lives as long as the process, so the taints never expire.
 */
function taintSecrets(config: WebConfig): void {
  experimental_taintObjectReference(
    'Do not pass the dashboard configuration to the client; pick the fields you need.',
    config,
  );
  const secrets = [
    config.DATABASE_URL,
    ...(config.SECRET_VAULT_PREVIOUS_KEYS ?? '').split(',').map((pair) => pair.split(':')[1]),
    ...Object.entries(config)
      .filter(([key]) => SECRET_CONFIG_KEY.test(key))
      .map(([, value]) => value),
  ];
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= MIN_TAINTED_LENGTH) {
      experimental_taintUniqueValue('Do not pass secrets to the client.', config, secret);
    }
  }
}

async function createWebServices(): Promise<WebServices> {
  const config = loadWebConfig();
  taintSecrets(config);
  const db = await getDatabase(config);
  const vault = SecretVault.fromConfig(config);
  const oauth = new DiscordOAuthClient({
    clientId: config.DISCORD_CLIENT_ID,
    clientSecret: config.DISCORD_CLIENT_SECRET,
    redirectUri: `${config.DASHBOARD_URL}/api/auth/callback`,
    apiBase: `${config.DISCORD_API_URL}/v10`,
  });
  const inviteOauth = new DiscordOAuthClient({
    clientId: config.DISCORD_CLIENT_ID,
    clientSecret: config.DISCORD_CLIENT_SECRET,
    redirectUri: `${config.DASHBOARD_URL}/api/invite/callback`,
    apiBase: `${config.DISCORD_API_URL}/v10`,
  });
  const sessions = new SessionService({ repo: new WebSessionRepository(db), vault, oauth });
  const botRest = new REST({ version: '10', api: config.DISCORD_API_URL }).setToken(
    config.DISCORD_TOKEN,
  );
  const botGuilds = new BotGuildDirectory(botRest);
  const guildAccess = new GuildAccessService({
    sessions,
    oauth,
    botGuildIds: () => botGuilds.guildIds(),
  });
  const audit = new AuditLogRepository(db);
  const passkeys = new PasskeyService({
    repo: new WebPasskeyRepository(db),
    sessions,
    audit,
    origin: config.DASHBOARD_URL,
  });
  const guildSettings = new GuildSettingsRepository(db);
  const moderation = new ModerationRepository(db);
  const commandCatalog = new CommandCatalogRepository(db);
  const guildConfig = new GuildConfigService({
    db,
    guildSettings,
    moderation,
    commandSettings: new CommandSettingsRepository(db),
    commandCatalog,
    autoRoles: new AutoRoleRepository(db),
    autoVoice: new AutoVoiceRepository(db),
    music: new MusicRepository(db),
    ai: new AiRepository(db),
    images: new ImageRepository(db),
    freeGames: new FreeGameRepository(db),
    welcomer: new WelcomerRepository(db),
    versions: new GuildConfigVersionRepository(db),
    audit,
    defaultPrefix: config.DEFAULT_PREFIX,
  });
  const guildResources = new GuildResourceDirectory(botRest);
  return {
    config,
    db,
    vault,
    oauth,
    inviteOauth,
    sessions,
    passkeys,
    knownDevices: new KnownDeviceService({ repo: new WebKnownDeviceRepository(db) }),
    users: new UserRepository(db),
    audit,
    botRest,
    guildAccess,
    guildResources,
    userDirectory: new UserDirectory(botRest),
    moderation,
    guildConfig,
    reactionRolePanels: new ReactionRolePanelService({
      db,
      reactionRoles: new ReactionRoleRepository(db),
      audit,
      rest: botRest,
      resources: guildResources,
    }),
    giveaways: new GiveawayManagementService({
      giveaways: new GiveawayRepository(db),
      audit,
      rest: botRest,
      resources: guildResources,
    }),
    // Handles are resolved with the same platform credentials as the bot; without them the
    // cleaned handle is stored, as `/stream` does.
    streamAlerts: new StreamAlertService({
      db,
      streams: new StreamRepository(db),
      audit,
      adapters: createStreamAdapters(config),
    }),
    welcomerBackgrounds: new WelcomerBackgroundService({
      db,
      welcomer: new WelcomerRepository(db),
      store: new WelcomerBackgroundStore(),
      audit,
    }),
    economyConfig: new EconomyConfigService({
      db,
      repository: new EconomyConfigRepository(db),
      audit,
    }),
    itemCatalog: new ItemCatalogService({
      db,
      items: new ItemRepository(db),
      categories: new ItemCategoryRepository(db),
      inventories: new InventoryRepository(db),
      audit,
    }),
    tcgRules: new TcgRulesService({ db, repository: new TcgConfigRepository(db), audit }),
    dungeonSeasons: new DungeonSeasonAdminService({
      db,
      seasons: new DungeonSeasonRepository(db),
      floors: new DungeonFloorRepository(db),
      bosses: new DungeonBossRepository(db),
      items: new GameItemRepository(db),
      audit,
    }),
    tcgItems: new TcgItemCatalogService({
      db,
      items: new GameItemRepository(db),
      inventories: new UserInventoryItemRepository(db),
      audit,
    }),
    tcgAchievements: new TcgAchievementAdminService({
      db,
      achievements: new AchievementRepository(db),
      audit,
    }),
    cardAlbum: new CardAlbumService({ cards: new WaifuCardRepository(db) }),
    commandCatalog,
    botActivity: new BotActivityRepository(db),
    guildRegistry: new GuildRepository(db),
    notifier: new DiscordNotifier({
      rest: botRest,
      guildSettings,
      dashboardUrl: config.DASHBOARD_URL,
    }),
  };
}

// Only the database connection is process-wide (kept on globalThis so dev-mode reloads reuse
// it). The services are built per module instance: a process-wide singleton would keep running
// old code after a hot reload and would hand callers objects whose classes come from another
// module instance, where `instanceof` checks fail.
const globalForDatabase = globalThis as typeof globalThis & {
  __ririkoWebDatabase?: Promise<DatabaseClient>;
};

function getDatabase(config: WebConfig): Promise<DatabaseClient> {
  globalForDatabase.__ririkoWebDatabase ??= createDatabaseClient({
    dialect: config.DATABASE_DIALECT,
    url: config.DATABASE_URL,
  })
    // The dashboard may start before the bot on an empty Postgres database.
    .then(async (db) => {
      await ensurePostgresSchema(db);
      await ensureTextIdColumns(db);
      await ensureGuildRegistrySchema(db);
      return db;
    })
    .catch((error: unknown) => {
      delete globalForDatabase.__ririkoWebDatabase;
      throw error;
    });
  return globalForDatabase.__ririkoWebDatabase;
}

let services: Promise<WebServices> | undefined;

export function getWebServices(): Promise<WebServices> {
  services ??= createWebServices().catch((error: unknown) => {
    services = undefined;
    throw error;
  });
  return services;
}
