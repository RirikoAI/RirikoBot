/// <reference types="react/experimental" />
import 'server-only';
import { REST } from '@discordjs/rest';
import { experimental_taintObjectReference, experimental_taintUniqueValue } from 'react';
import { loadWebConfig, SecretVault, type WebConfig } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  UserRepository,
  WebKnownDeviceRepository,
  WebPasskeyRepository,
  WebSessionRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigService } from '@ririko/services/guild';
import { DiscordOAuthClient } from './auth/discord-oauth';
import { KnownDeviceService } from './auth/known-devices';
import { PasskeyService } from './auth/passkeys';
import { SessionService } from './auth/session-service';
import { DiscordNotifier } from './discord-notifier';
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
  knownDevices: KnownDeviceService;
  users: UserRepository;
  /** Append-only `audit_logs` writer for account events. */
  audit: AuditLogRepository;
  /** Discord REST client authenticated with the bot token; server-side only. */
  botRest: REST;
  guildAccess: GuildAccessService;
  /** Channels and roles for pickers; only after `requireGuildAccess`. */
  guildResources: GuildResourceDirectory;
  guildConfig: GuildConfigService;
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
  const guildSettings = new GuildSettingsRepository(db);
  const guildConfig = new GuildConfigService({
    db,
    guildSettings,
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
    knownDevices: new KnownDeviceService({ repo: new WebKnownDeviceRepository(db) }),
    users: new UserRepository(db),
    audit,
    botRest,
    guildAccess,
    guildResources: new GuildResourceDirectory(botRest),
    guildConfig,
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
  }).catch((error: unknown) => {
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
