import { AppError } from '@ririko/core';
import { commandAccessError } from './access.js';
import type { CommandDefinition, CommandMetadata, ContextMenuType, HelpQuery, HelpResult } from './contracts.js';

const namePattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;

function freezeObject<T extends object>(object: T): T {
  for (const value of Object.values(object)) {
    if (value !== null && typeof value === 'object') freezeObject(value as object);
  }
  return Object.freeze(object);
}

/** Registration happens once; invocation resolves names/aliases through maps. */
export class CommandRegistry {
  private readonly metadata = new Map<string, CommandMetadata>();
  private readonly routes = new Map<string, CommandDefinition>();
  private readonly contexts = new Map<string, CommandDefinition>();

  constructor(definitions: readonly CommandDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: CommandDefinition): void {
    if (!namePattern.test(definition.name) || !namePattern.test(definition.module) || !namePattern.test(definition.category)) {
      throw new AppError('REGISTRATION', 'Command, category and module names must be lowercase identifiers.');
    }
    if (!definition.description || definition.description.length > 100) throw new AppError('REGISTRATION', 'Command descriptions must have 1–100 characters.');
    if (definition.cooldownMs !== undefined && (!Number.isSafeInteger(definition.cooldownMs) || definition.cooldownMs < 0)) {
      throw new AppError('REGISTRATION', 'Cooldown must be a nonnegative integer.');
    }
    const routes = [definition.name, ...(definition.aliases ?? [])];
    if (new Set(routes).size !== routes.length) throw new AppError('REGISTRATION', 'Duplicate alias in command definition.');
    for (const route of routes) {
      const parts = route.split(' ');
      if (parts.length > 2 || parts.some((part) => !namePattern.test(part))) throw new AppError('REGISTRATION', 'Aliases support one or two lowercase command words.');
      if (this.routes.has(route)) throw new AppError('REGISTRATION', `Command name or alias is already registered: ${route}.`);
    }
    const optionNames = new Set<string>();
    for (const option of definition.options ?? []) {
      if (!namePattern.test(option.name) || optionNames.has(option.name)) throw new AppError('REGISTRATION', 'Option names must be valid and unique.');
      if (!option.description || option.description.length > 100) throw new AppError('REGISTRATION', 'Option descriptions must have 1–100 characters.');
      if (option.min !== undefined && option.max !== undefined && option.min > option.max) throw new AppError('REGISTRATION', 'Option minimum exceeds maximum.');
      optionNames.add(option.name);
    }
    const contextKeys = new Set<string>();
    for (const context of definition.contextMenus ?? []) {
      const key = `${context.type}:${context.name}`;
      if (!context.name || context.name.length > 32 || contextKeys.has(key) || this.contexts.has(key)) {
        throw new AppError('REGISTRATION', 'Context menu names must be valid and unique within their type.');
      }
      contextKeys.add(key);
    }
    // Snapshot metadata so a caller cannot change aliases/policy after validation.
    const { execute, ...metadata } = definition;
    const snapshot = freezeObject(structuredClone(metadata));
    const stored = freezeObject({ ...snapshot, execute });
    this.metadata.set(stored.name, snapshot);
    for (const route of routes) this.routes.set(route, stored);
    for (const context of stored.contextMenus ?? []) this.contexts.set(`${context.type}:${context.name}`, stored);
  }

  resolve(name: string): CommandDefinition | undefined {
    return this.routes.get(name.toLowerCase());
  }

  resolveContext(name: string, type: ContextMenuType): CommandDefinition | undefined {
    return this.contexts.get(`${type}:${name}`);
  }

  /** Legacy spaced giveaway aliases use at most two map probes, independent of registry size. */
  resolvePrefix(tokens: readonly string[]): { command: CommandDefinition; consumed: number } | undefined {
    if (tokens.length > 1) {
      const command = this.routes.get(`${tokens[0]} ${tokens[1]}`.toLowerCase());
      if (command) return { command, consumed: 2 };
    }
    const command = tokens[0] ? this.resolve(tokens[0]) : undefined;
    return command ? { command, consumed: 1 } : undefined;
  }

  list(): readonly CommandMetadata[] {
    return [...this.metadata.values()];
  }

  getHelp(query: HelpQuery): HelpResult {
    const visible = this.list().filter((command) => !command.hidden && !commandAccessError(command, query.actor, query.settings));
    const categories = [...new Set(visible.map((command) => command.category))].sort();
    const search = query.search?.trim().toLowerCase() ?? '';
    const category = query.category?.trim().toLowerCase() || null;
    const filtered = visible.filter((command) => (!category || category === command.category) &&
      (!search || [command.name, command.description, ...(command.aliases ?? [])].some((value) => value.toLowerCase().includes(search))))
      .sort((left, right) => left.name.localeCompare(right.name));
    const pageSize = Math.max(1, Math.min(10, Number.isFinite(query.pageSize) ? Math.floor(query.pageSize ?? 5) : 5));
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.max(1, Math.min(pageCount, Number.isFinite(query.page) ? Math.floor(query.page ?? 1) : 1));
    const prefix = query.settings?.prefix ?? '!';
    const entries = filtered.slice((page - 1) * pageSize, page * pageSize).map((command) => ({
      name: command.name,
      description: command.description,
      category: command.category,
      aliases: command.aliases ?? [],
      slashExamples: command.examples.slash,
      prefixExamples: command.examples.prefix.map((example) => example.startsWith('!') ? prefix + example.slice(1) : example),
      permissions: command.permissions ?? [],
      botPermissions: command.botPermissions ?? [],
      cooldownMs: command.cooldownMs ?? 0,
    }));
    const lines = entries.map((entry) => `**${entry.name}** — ${entry.description}\n${[...entry.slashExamples, ...entry.prefixExamples].join(' · ')}${entry.aliases.length ? `\nAliases: ${entry.aliases.join(', ')}` : ''}\nPermissions: ${entry.permissions.join(', ') || 'Everyone'} · Cooldown: ${entry.cooldownMs / 1000}s${entry.botPermissions.length ? ` · Bot: ${entry.botPermissions.join(', ')}` : ''}`);
    const heading = `Commands · page ${page}/${pageCount} · ${filtered.length} available`;
    const content = (lines.length ? `${heading}\n\n${lines.join('\n\n')}` : 'No available commands match that search.').slice(0, 1900);
    return { kind: 'help', content, entries, categories, page, pageCount, total: filtered.length, search, category };
  }
}
