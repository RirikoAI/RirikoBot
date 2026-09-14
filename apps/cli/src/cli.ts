import { AppError, SettingsService, loadConfig, publicError, snowflakeSchema, type ActorContext } from '@ririko/core';
import { connectDatabase } from '@ririko/database';
import { CommandRegistry, createBuiltinCommands } from '@ririko/discord';
import { diagnose } from './doctor.js';
import { generateCommand } from './generate.js';
import { synchronizeCommands } from './sync.js';

/** Inject streams and environment for repeatable offline operator tests. */
export interface CliContext {
  env: Record<string, string | undefined>;
  cwd: string;
  out(text: string): void;
  error(text: string): void;
}

const usage = `Ririko AI 2.0.0
  version
  doctor [--json]
  migrate
  migrate:status
  health
  command:list [--json]
  command:sync [--global]
  module:list
  module:enable <guildId> <module>
  module:disable <guildId> <module>
  guild:config <guildId> [--prefix <value>]
  generate command <name>

Run from the workspace root. Database migrations and Discord command sync are explicit actions.
Legacy migration, dashboard, and provider modules are tracked in docs/implementation-roadmap.md.`;

/** Execute implemented operator commands; return a meaningful process exit code. */
export async function runCli(args: readonly string[], context: CliContext): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (!command || command === 'help' || command === '--help') { context.out(usage); return 0; }
    if (command === 'version' || command === '--version') { context.out('2.0.0'); return 0; }
    if (command === 'generate') {
      if (rest.length !== 2 || rest[0] !== 'command' || !rest[1]) throw new AppError('USAGE', 'Usage: generate command <name>');
      context.out((await generateCommand(rest[1], context.cwd)).join('\n'));
      return 0;
    }
    const known = ['doctor', 'migrate', 'migrate:status', 'health', 'command:list', 'command:sync', 'module:list', 'module:enable', 'module:disable', 'guild:config'];
    if (!known.includes(command)) throw new AppError('USAGE', `Unknown or unimplemented command: ${command}. Run ririko help.`);
    const config = loadConfig(context.env);
    const database = await connectDatabase(config.database);
    try {
      const settings = new SettingsService(database.settings, config.defaultPrefix);
      const registry = new CommandRegistry();
      for (const definition of createBuiltinCommands(settings, registry)) registry.register(definition);
      const actorFor = (guildId: string): ActorContext => {
        const userId = config.discord.ownerIds[0];
        if (!userId) throw new AppError('CONFIG', 'Configure BOT_OWNER_IDS before using administrative CLI writes.');
        return { userId, guildId: snowflakeSchema.parse(guildId), roles: [], permissions: ['ManageGuild'], botPermissions: [], isOwner: true };
      };
      switch (command) {
        case 'doctor': {
          if (rest.length > 1 || (rest[0] !== undefined && rest[0] !== '--json')) throw new AppError('USAGE', 'Usage: doctor [--json]');
          const checks = await diagnose(config, database, context.cwd);
          context.out(rest[0] === '--json' ? JSON.stringify(checks, null, 2) : checks.map((check) => `${check.status === 'ok' ? '✓' : check.status === 'optional' ? '!' : '✗'} ${check.name}: ${check.detail}`).join('\n'));
          return checks.some((check) => check.status === 'error') ? 1 : 0;
        }
        case 'migrate':
          if (rest.length) throw new AppError('USAGE', 'Usage: migrate');
          await database.migrate();
          context.out('Foundation schema migrations applied. This does not import a legacy database.');
          return 0;
        case 'migrate:status':
          context.out(JSON.stringify(await database.migrationStatus()));
          return 0;
        case 'health':
          await database.healthCheck();
          context.out('Database ready. Discord connection is reported by the running bot /health/ready endpoint.');
          return 0;
        case 'command:list':
          if (rest.length > 1 || (rest[0] !== undefined && rest[0] !== '--json')) throw new AppError('USAGE', 'Usage: command:list [--json]');
          context.out(rest[0] === '--json' ? JSON.stringify(registry.list(), null, 2) : registry.list().map((entry) => `${entry.name}: ${entry.description}`).join('\n'));
          return 0;
        case 'command:sync':
          if (rest.length > 1 || (rest[0] !== undefined && rest[0] !== '--global')) throw new AppError('USAGE', 'Usage: command:sync [--global]');
          await synchronizeCommands(config, registry.list(), rest[0] === '--global');
          context.out('Discord commands synchronized from the registry.');
          return 0;
        case 'module:list':
          context.out(JSON.stringify(settings.modules, null, 2));
          return 0;
        case 'module:enable':
        case 'module:disable': {
          const [guildId, moduleId] = rest;
          if (!guildId || !moduleId || rest.length !== 2) throw new AppError('USAGE', `Usage: ${command} <guildId> <module>`);
          context.out(JSON.stringify(await settings.setModule(actorFor(guildId), moduleId, command === 'module:enable'), null, 2));
          return 0;
        }
        case 'guild:config': {
          const [guildId, flag, prefix] = rest;
          if (!guildId || (rest.length !== 1 && (rest.length !== 3 || flag !== '--prefix' || prefix === undefined))) throw new AppError('USAGE', 'Usage: guild:config <guildId> [--prefix <value>]');
          const value = prefix === undefined ? await settings.get(snowflakeSchema.parse(guildId)) : await settings.setPrefix(actorFor(guildId), prefix);
          context.out(JSON.stringify(value, null, 2));
          return 0;
        }
      }
      throw new AppError('USAGE', 'Unrecognized command.');
    } finally { await database.close(); }
  } catch (error) {
    context.error(publicError(error));
    return 1;
  }
}
