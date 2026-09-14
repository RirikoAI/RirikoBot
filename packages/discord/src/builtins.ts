import type { CommandDefinition, CommandSettings } from './contracts.js';
import type { CommandRegistry } from './registry.js';

/** Working foundation commands only. Stateful prefix changes use the shared settings service. */
export function createBuiltinCommands(settings: CommandSettings, registry: CommandRegistry): readonly CommandDefinition[] {
  return [
    {
      name: 'ping', description: 'Check whether Ririko is responding.', category: 'general', module: 'core', cooldownMs: 1000,
      examples: { slash: ['/ping'], prefix: ['!ping'] },
      contextMenus: [{ name: 'Ping from user context', type: 'user' }, { name: 'Ping from chat context', type: 'message' }],
      execute(context) {
        const latency = context.latencyMs;
        return Promise.resolve({ kind: 'text', content: latency !== undefined && Number.isFinite(latency) && latency >= 0 ? `Pong! Response latency: ${Math.round(latency)} ms.` : 'Pong!' });
      },
    },
    {
      name: 'prefix', aliases: ['setprefix'], description: 'View or change this server’s command prefix.', category: 'guild', module: 'core', guildOnly: true,
      permissions: ['ManageGuild'], cooldownMs: 1000, defaultEphemeral: true,
      options: [{ name: 'newprefix', description: 'New prefix, 1–16 characters without whitespace.', type: 'string', max: 16 }],
      examples: { slash: ['/prefix', '/prefix newprefix:?'], prefix: ['!prefix', '!setprefix ?'] },
      async execute(context) {
        const newPrefix = context.args.newprefix;
        if (typeof newPrefix === 'string') {
          const updated = await settings.setPrefix(context.actor, newPrefix);
          return { kind: 'text', content: `Server prefix is now ${updated.prefix}`, ephemeral: true };
        }
        return { kind: 'text', content: `Server prefix: ${context.settings?.prefix ?? '!'}`, ephemeral: true };
      },
    },
    {
      name: 'help', description: 'Find available commands by name or category.', category: 'general', module: 'core', cooldownMs: 1000, defaultEphemeral: true,
      options: [
        { name: 'command', description: 'Command name, alias, or search text.', type: 'string', max: 100 },
        { name: 'category', description: 'Show one category.', type: 'string', max: 32 },
        { name: 'page', description: 'Page number.', type: 'integer', min: 1, max: 10000 },
      ],
      examples: { slash: ['/help', '/help command:prefix', '/help category:general page:1'], prefix: ['!help', '!help prefix', '!help --category general --page 1'] },
      execute(context) {
        return Promise.resolve(registry.getHelp({
          actor: context.actor, settings: context.settings,
          ...(typeof context.args.command === 'string' ? { search: context.args.command } : {}),
          ...(typeof context.args.category === 'string' ? { category: context.args.category } : {}),
          ...(typeof context.args.page === 'number' ? { page: context.args.page } : {}),
        }));
      },
    },
  ];
}
