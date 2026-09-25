import 'server-only';
import { REST } from '@discordjs/rest';
import { loadWebConfig, SecretVault, type WebConfig } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  UserRepository,
  WebPasskeyRepository,
  WebSessionRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigService } from '@ririko/services/guild';
import { DiscordOAuthClient } from './auth/discord-oauth';
import { PasskeyService } from './auth/passkeys';
import { SessionService } from './auth/session-service';
import { BotGuildDirectory } from './guilds/bot-guilds';
import { GuildAccessService } from './guilds/guild-access';
import { GuildResourceDirectory } from './guilds/guild-resources';

/**
 * Server-side dependencies of the dashboard. Built once per process from the shared monorepo
 * configuration; never import this module from a client component.
 */
export interface WebServices {
  config: WebConfig;
  db: DatabaseClient;
  vault: SecretVault;
  oauth: DiscordOAuthClient;
  sessions: SessionService;
  passkeys: PasskeyService;
  users: UserRepository;
  /** Discord REST client authenticated with the bot token; server-side only. */
  botRest: REST;
  guildAccess: GuildAccessService;
  /** Channels and roles for pickers; only after `requireGuildAccess`. */
  guildResources: GuildResourceDirectory;
  guildConfig: GuildConfigService;
}

async function createWebServices(): Promise<WebServices> {
  const config = loadWebConfig();
  const db = await createDatabaseClient({
    dialect: config.DATABASE_DIALECT,
    url: config.DATABASE_URL,
  });
  const vault = SecretVault.fromConfig(config);
  const oauth = new DiscordOAuthClient({
    clientId: config.DISCORD_CLIENT_ID,
    clientSecret: config.DISCORD_CLIENT_SECRET,
    redirectUri: `${config.DASHBOARD_URL}/api/auth/callback`,
  });
  const sessions = new SessionService({ repo: new WebSessionRepository(db), vault, oauth });
  const botRest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
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
  const guildConfig = new GuildConfigService({
    db,
    guildSettings: new GuildSettingsRepository(db),
    versions: new GuildConfigVersionRepository(db),
    audit,
    defaultPrefix: config.DEFAULT_PREFIX,
  });
  return {
    config,
    db,
    vault,
    oauth,
    sessions,
    passkeys,
    users: new UserRepository(db),
    botRest,
    guildAccess,
    guildResources: new GuildResourceDirectory(botRest),
    guildConfig,
  };
}

// Kept on globalThis so dev-mode module reloads reuse one database connection.
const globalForServices = globalThis as typeof globalThis & {
  __ririkoWebServices?: Promise<WebServices>;
};

export function getWebServices(): Promise<WebServices> {
  globalForServices.__ririkoWebServices ??= createWebServices().catch((error: unknown) => {
    delete globalForServices.__ririkoWebServices;
    throw error;
  });
  return globalForServices.__ririkoWebServices;
}
