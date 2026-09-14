import { CoreEvents, EventListener } from './types.js';

interface ListenerEntry<T> {
  fn: EventListener<T>;
  once: boolean;
}

export interface EventBusOptions {
  errorHandler?: (error: unknown, eventName: string | symbol, payload: unknown) => void;
}

/**
 * Strongly-typed, asynchronous event bus with error isolation.
 */
export class EventBus<TEventMap extends object = CoreEvents> {
  private readonly listeners = new Map<keyof TEventMap, Set<ListenerEntry<unknown>>>();
  private readonly errorHandler: (
    error: unknown,
    eventName: string | symbol,
    payload: unknown,
  ) => void;

  constructor(options: EventBusOptions = {}) {
    this.errorHandler =
      options.errorHandler ??
      ((error, eventName) => {
        console.error(`[EventBus] Uncaught listener error on event '${String(eventName)}':`, error);
      });
  }

  /**
   * Subscribes a listener to an event.
   * Returns an unsubscribe function.
   */
  public on<K extends keyof TEventMap>(
    event: K,
    listener: EventListener<TEventMap[K]>,
  ): () => void {
    return this.addListener(event, listener as EventListener<unknown>, false);
  }

  /**
   * Subscribes a one-time listener to an event.
   * Automatically unsubscribes after first execution.
   */
  public once<K extends keyof TEventMap>(
    event: K,
    listener: EventListener<TEventMap[K]>,
  ): () => void {
    return this.addListener(event, listener as EventListener<unknown>, true);
  }

  /**
   * Unsubscribes a listener from an event.
   */
  public off<K extends keyof TEventMap>(event: K, listener: EventListener<TEventMap[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;

    for (const entry of set) {
      if (entry.fn === (listener as unknown)) {
        set.delete(entry);
        break;
      }
    }

    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emits an event synchronously / in background (fire-and-forget).
   * Listener errors are caught and forwarded to errorHandler.
   */
  public emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    void this.emitAsync(event, payload);
  }

  /**
   * Emits an event and waits for all listeners to resolve via Promise.allSettled.
   * Errors in individual listeners are isolated and forwarded to errorHandler without rejecting the call.
   */
  public async emitAsync<K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
  ): Promise<void> {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // Snapshot entries in case a listener unsubscribes itself during execution
    const entries = Array.from(set);

    const promises = entries.map(async (entry) => {
      if (entry.once) {
        set.delete(entry);
      }
      try {
        await entry.fn(payload);
      } catch (err) {
        this.errorHandler(err, String(event), payload);
      }
    });

    await Promise.allSettled(promises);

    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Returns the count of registered listeners for an event (or all events).
   */
  public listenerCount<K extends keyof TEventMap>(event?: K): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Removes all registered listeners for an event (or all events).
   */
  public removeAllListeners<K extends keyof TEventMap>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  private addListener<K extends keyof TEventMap>(
    event: K,
    listener: EventListener<unknown>,
    once: boolean,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    const entry: ListenerEntry<unknown> = { fn: listener, once };
    set.add(entry);

    return () => {
      set?.delete(entry);
      if (set && set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }
}

/**
 * Creates a new typed EventBus instance.
 */
export function createEventBus<TEventMap extends object = CoreEvents>(
  options?: EventBusOptions,
): EventBus<TEventMap> {
  return new EventBus<TEventMap>(options);
}

/**
 * Global shared CoreEvents bus singleton.
 */
export const systemEventBus = new EventBus<CoreEvents>();
