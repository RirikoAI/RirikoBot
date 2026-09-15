import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewarePipelineOptions } from './types.js';

/**
 * Composable, onion-style Middleware Pipeline engine.
 * Sequentially passes CommandContext through global and command-specific middlewares.
 */
export class MiddlewarePipeline {
  private readonly middlewares: CommandMiddleware[] = [];
  private readonly options: MiddlewarePipelineOptions;

  constructor(options: MiddlewarePipelineOptions = {}) {
    this.options = options;
  }

  /**
   * Registers one or more global middlewares to the pipeline.
   */
  public use(...middlewares: CommandMiddleware[]): this {
    this.middlewares.push(...middlewares);
    return this;
  }

  /**
   * Returns the count of registered global middlewares.
   */
  public get length(): number {
    return this.middlewares.length;
  }

  /**
   * Clears all registered global middlewares (useful for testing or reset).
   */
  public clear(): void {
    this.middlewares.length = 0;
  }

  /**
   * Executes the middleware pipeline with onion-style nesting.
   * Runs all registered global middlewares, followed by command-level middlewares,
   * followed by any explicitly passed extra middlewares, and finally invokes `target()`.
   */
  public async execute(
    ctx: CommandContext,
    target: () => Promise<void>,
    extraMiddlewares: readonly CommandMiddleware[] = [],
  ): Promise<void> {
    const commandMiddlewares = ctx.command?.metadata.middlewares ?? [];
    const chain: readonly CommandMiddleware[] = [
      ...this.middlewares,
      ...commandMiddlewares,
      ...extraMiddlewares,
    ];

    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times in middleware chain');
      }
      index = i;

      if (i === chain.length) {
        await target();
        return;
      }

      const fn = chain[i];
      if (!fn) {
        return;
      }

      await fn(ctx, () => dispatch(i + 1));
    };

    try {
      await dispatch(0);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.options.onError) {
        try {
          await this.options.onError(ctx, err);
        } catch {
          // Suppress hook error so original error propagates cleanly
        }
      }
      throw error;
    }
  }
}
