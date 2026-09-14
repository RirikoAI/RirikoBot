/** Trusted identity and effective permissions supplied by an authenticated transport. */
export interface ActorContext {
  userId: string;
  guildId?: string;
  channelId?: string;
  roles: readonly string[];
  permissions: readonly string[];
  botPermissions: readonly string[];
  isOwner: boolean;
}

/** Guild restrictions may narrow a command's built-in permission requirements. */
export interface CommandPolicy {
  enabled?: boolean;
  allowedRoleIds?: string[];
  channels?: Record<string, boolean>;
}

/** Shared bot, CLI and dashboard settings; revision zero denotes unsaved defaults. */
export interface GuildSettings {
  guildId: string;
  prefix: string;
  modules: Record<string, boolean>;
  commands: Record<string, CommandPolicy>;
  revision: number;
}

/** Implementations commit settings and an actor audit record atomically. */
export interface GuildSettingsStore {
  get(guildId: string): Promise<GuildSettings | undefined>;
  save(settings: GuildSettings, expectedRevision: number, actorId: string): Promise<GuildSettings>;
}

/** Module discovery only includes code that has actually been implemented. */
export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  essential?: boolean;
}
