import { describe, expect, it, vi } from 'vitest';
import { createEventBus, EventBus } from './index.js';

interface TestEvents {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'calc:add': { a: number; b: number };
}

describe('EventBus', () => {
  it('subscribes and receives emitted events with payload', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();

    bus.on('user:login', handler);
    await bus.emitAsync('user:login', { userId: 'u-123', timestamp: 1000 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ userId: 'u-123', timestamp: 1000 });
  });

  it('unsubscribes via returned function', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();

    const unsubscribe = bus.on('user:login', handler);
    expect(bus.listenerCount('user:login')).toBe(1);

    unsubscribe();
    expect(bus.listenerCount('user:login')).toBe(0);

    await bus.emitAsync('user:login', { userId: 'u-123', timestamp: 1000 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribes via bus.off()', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();

    bus.on('user:logout', handler);
    expect(bus.listenerCount('user:logout')).toBe(1);

    bus.off('user:logout', handler);
    expect(bus.listenerCount('user:logout')).toBe(0);

    await bus.emitAsync('user:logout', { userId: 'u-123' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('executes once() listener exactly once', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();

    bus.once('user:logout', handler);
    expect(bus.listenerCount('user:logout')).toBe(1);

    await bus.emitAsync('user:logout', { userId: 'u-1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('user:logout')).toBe(0);

    await bus.emitAsync('user:logout', { userId: 'u-2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isolates listener errors so sibling listeners still execute', async () => {
    const customErrorHandler = vi.fn();
    const bus = new EventBus<TestEvents>({ errorHandler: customErrorHandler });

    const failingHandler = vi.fn(() => {
      throw new Error('Database connection lost in listener');
    });
    const succeedingHandler = vi.fn();

    bus.on('calc:add', failingHandler);
    bus.on('calc:add', succeedingHandler);

    await bus.emitAsync('calc:add', { a: 1, b: 2 });

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(succeedingHandler).toHaveBeenCalledTimes(1);
    expect(customErrorHandler).toHaveBeenCalledTimes(1);
    expect(customErrorHandler).toHaveBeenCalledWith(expect.any(Error), 'calc:add', { a: 1, b: 2 });
  });

  it('handles async listeners with Promise resolution', async () => {
    const bus = createEventBus<TestEvents>();
    let state = 0;

    bus.on('calc:add', async ({ a, b }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      state = a + b;
    });

    await bus.emitAsync('calc:add', { a: 5, b: 10 });
    expect(state).toBe(15);
  });

  it('supports removeAllListeners for specific event or all events', () => {
    const bus = createEventBus<TestEvents>();
    bus.on('user:login', vi.fn());
    bus.on('user:login', vi.fn());
    bus.on('user:logout', vi.fn());

    expect(bus.listenerCount('user:login')).toBe(2);
    expect(bus.listenerCount('user:logout')).toBe(1);
    expect(bus.listenerCount()).toBe(3);

    bus.removeAllListeners('user:login');
    expect(bus.listenerCount('user:login')).toBe(0);
    expect(bus.listenerCount('user:logout')).toBe(1);

    bus.removeAllListeners();
    expect(bus.listenerCount()).toBe(0);
  });
});
