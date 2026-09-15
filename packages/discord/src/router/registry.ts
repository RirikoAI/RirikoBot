import { ValidationError } from '@ririko/core';
import type { Command, CommandCategory } from '../command/types.js';

/**
 * High-performance O(1) Command Registry.
 * Maintains indexed hash maps for primary command names, aliases, and categories.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly aliases = new Map<string, string>();
  private readonly categories = new Map<CommandCategory, Set<string>>();

  /**
   * Registers a command into the registry.
   * Enforces name uniqueness and alias conflict checks.
   */
  public register(command: Command): this {
    const name = command.metadata.name.toLowerCase().trim();
    if (!name) {
      throw new ValidationError('Command name cannot be empty.');
    }

    if (this.commands.has(name)) {
      throw new ValidationError(`Command with name "${name}" is already registered.`);
    }

    if (this.aliases.has(name)) {
      throw new ValidationError(`Command name "${name}" collides with an existing command alias.`);
    }

    // Register primary command
    this.commands.set(name, command);

    // Register aliases
    if (command.metadata.aliases && command.metadata.aliases.length > 0) {
      for (const alias of command.metadata.aliases) {
        const lowerAlias = alias.toLowerCase().trim();
        if (!lowerAlias) continue;

        if (this.commands.has(lowerAlias)) {
          throw new ValidationError(
            `Alias "${lowerAlias}" collides with an existing primary command name.`,
          );
        }

        if (this.aliases.has(lowerAlias)) {
          throw new ValidationError(
            `Alias "${lowerAlias}" is already registered by another command.`,
          );
        }

        this.aliases.set(lowerAlias, name);
      }
    }

    // Group by category
    const category = command.metadata.category;
    let categorySet = this.categories.get(category);
    if (!categorySet) {
      categorySet = new Set<string>();
      this.categories.set(category, categorySet);
    }
    categorySet.add(name);

    return this;
  }

  /**
   * Registers multiple commands in batch.
   */
  public registerAll(commands: readonly Command[]): this {
    for (const command of commands) {
      this.register(command);
    }
    return this;
  }

  /**
   * Unregisters a command by name or alias.
   */
  public unregister(nameOrAlias: string): boolean {
    const key = nameOrAlias.toLowerCase().trim();
    const primaryName = this.aliases.get(key) ?? key;
    const command = this.commands.get(primaryName);

    if (!command) {
      return false;
    }

    // Remove primary command
    this.commands.delete(primaryName);

    // Remove aliases
    if (command.metadata.aliases) {
      for (const alias of command.metadata.aliases) {
        this.aliases.delete(alias.toLowerCase().trim());
      }
    }

    // Remove from category
    const categorySet = this.categories.get(command.metadata.category);
    if (categorySet) {
      categorySet.delete(primaryName);
    }

    return true;
  }

  /**
   * Looks up a command by its primary name or registered alias in constant O(1) time.
   */
  public get(nameOrAlias: string): Command | undefined {
    const key = nameOrAlias.toLowerCase().trim();
    const directMatch = this.commands.get(key);
    if (directMatch) {
      return directMatch;
    }

    const primaryName = this.aliases.get(key);
    if (primaryName) {
      return this.commands.get(primaryName);
    }

    return undefined;
  }

  /**
   * Checks if a command exists under the given name or alias.
   */
  public has(nameOrAlias: string): boolean {
    return this.get(nameOrAlias) !== undefined;
  }

  /**
   * Returns an array of all registered commands.
   */
  public getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Returns all commands belonging to a given category.
   */
  public getByCategory(category: CommandCategory): Command[] {
    const names = this.categories.get(category);
    if (!names) {
      return [];
    }

    const result: Command[] = [];
    for (const name of names) {
      const cmd = this.commands.get(name);
      if (cmd) {
        result.push(cmd);
      }
    }
    return result;
  }

  /**
   * Returns the total count of registered primary commands.
   */
  public get size(): number {
    return this.commands.size;
  }

  /**
   * Clears all registered commands and aliases.
   */
  public clear(): void {
    this.commands.clear();
    this.aliases.clear();
    this.categories.clear();
  }
}
