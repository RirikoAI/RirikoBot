import { GuildQueue } from './guild-queue.js';
import type { GuildQueueOptions } from './types.js';

export class QueueManager {
  private readonly queues = new Map<string, GuildQueue>();

  /**
   * Retrieves an active guild queue by guildId.
   */
  get(guildId: string): GuildQueue | undefined {
    return this.queues.get(guildId);
  }

  /**
   * Checks whether an active queue exists for the given guildId.
   */
  has(guildId: string): boolean {
    return this.queues.has(guildId);
  }

  /**
   * Gets an existing guild queue, or creates and registers a new one.
   */
  getOrCreate(guildId: string, options?: Partial<GuildQueueOptions>): GuildQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new GuildQueue({
        guildId,
        ...options,
      });
      this.queues.set(guildId, queue);
    }
    return queue;
  }

  /**
   * Destroys and removes the queue for a guild.
   */
  delete(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.destroy();
      this.queues.delete(guildId);
      return true;
    }
    return false;
  }

  /**
   * Returns a list of all active guild queues.
   */
  getAll(): GuildQueue[] {
    return Array.from(this.queues.values());
  }

  /**
   * Cleans up and destroys all active queues across all guilds.
   */
  destroyAll(): void {
    for (const queue of this.queues.values()) {
      queue.destroy();
    }
    this.queues.clear();
  }

  /**
   * Returns the count of active guild queues.
   */
  get size(): number {
    return this.queues.size;
  }
}
