import type { SafeTool, ToolExecutionContext } from './types.js';
import type { ToolDefinition } from '../types/index.js';
import {
  TimeTool,
  CoinFlipTool,
  AnimeSearchTool,
  ReminderTool,
  MusicPlayTool,
  EconomyBalanceTool,
} from './definitions/index.js';

export class ToolRegistry {
  private readonly tools = new Map<string, SafeTool>();

  register(tool: SafeTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): SafeTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): SafeTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns tool definitions formatted for LLM function calling schemas,
   * optionally filtered by allowed tool names.
   */
  getDefinitions(filterNames?: string[]): ToolDefinition[] {
    if (!filterNames || filterNames.length === 0) {
      return this.getAll().map((t) => t.definition);
    }

    return filterNames
      .map((name) => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Validates tool input arguments using the tool's strict Zod schema.
   */
  validateArgs<T = unknown>(name: string, rawArgs: unknown): T {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered in the tool allowlist.`);
    }

    return tool.schema.parse(rawArgs || {}) as T;
  }

  /**
   * Executes a tool with input validation.
   */
  async execute<T = unknown>(
    name: string,
    rawArgs: unknown,
    context: ToolExecutionContext,
  ): Promise<T> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered in the tool allowlist.`);
    }

    const validatedArgs = this.validateArgs(name, rawArgs);
    return tool.execute(validatedArgs, context) as Promise<T>;
  }

  /**
   * Factory that initializes the registry populated with all safe default tools.
   */
  static createDefault(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register(new TimeTool());
    registry.register(new CoinFlipTool());
    registry.register(new AnimeSearchTool());
    registry.register(new ReminderTool());
    registry.register(new MusicPlayTool());
    registry.register(new EconomyBalanceTool());
    return registry;
  }
}
