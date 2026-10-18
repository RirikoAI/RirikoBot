import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../command/types.js';
import { createNoticeMiddleware } from './notice.js';

const ctxFor = (userId: string) => ({ user: { id: userId } }) as unknown as CommandContext;

function setup(overrides: Partial<Parameters<typeof createNoticeMiddleware>[0]> = {}) {
  const order: string[] = [];
  const options = {
    shouldNotify: vi.fn(() => {
      order.push('check');
      return true;
    }),
    notify: vi.fn(async () => {
      order.push('notify');
    }),
    onNotified: vi.fn(async () => {
      order.push('notified');
    }),
    onError: vi.fn(),
    ...overrides,
  };
  const next = vi.fn(async () => {
    order.push('command');
  });
  return { middleware: createNoticeMiddleware(options), options, next, order };
}

describe('createNoticeMiddleware', () => {
  it('shows the notice after the command and then reports it', async () => {
    const { middleware, options, next, order } = setup();

    await middleware(ctxFor('u1'), next);

    expect(order).toEqual(['command', 'check', 'notify', 'notified']);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('shows nothing when the user does not need the notice', async () => {
    const { middleware, options, next } = setup({ shouldNotify: vi.fn(() => false) });

    await middleware(ctxFor('u1'), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(options.notify).not.toHaveBeenCalled();
    expect(options.onNotified).not.toHaveBeenCalled();
  });

  it('shows no notice when the command throws, and lets the error through', async () => {
    const { middleware, options } = setup();
    const next = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(middleware(ctxFor('u1'), next)).rejects.toThrow('boom');

    expect(options.shouldNotify).not.toHaveBeenCalled();
    expect(options.notify).not.toHaveBeenCalled();
  });

  it('reports a failing check without failing the command', async () => {
    const error = new Error('read failed');
    const { middleware, options, next } = setup({ shouldNotify: vi.fn().mockRejectedValue(error) });

    await expect(middleware(ctxFor('u1'), next)).resolves.toBeUndefined();

    expect(options.onError).toHaveBeenCalledWith(expect.anything(), error);
    expect(options.notify).not.toHaveBeenCalled();
  });

  it('does not report the notice as delivered when sending it fails', async () => {
    const error = new Error('cannot send');
    const { middleware, options, next } = setup({ notify: vi.fn().mockRejectedValue(error) });

    await middleware(ctxFor('u1'), next);

    expect(options.onError).toHaveBeenCalledWith(expect.anything(), error);
    expect(options.onNotified).not.toHaveBeenCalled();
  });

  it('survives a failing error hook', async () => {
    const { middleware, next } = setup({
      shouldNotify: vi.fn().mockRejectedValue(new Error('x')),
      onError: vi.fn(() => {
        throw new Error('logger down');
      }),
    });

    await expect(middleware(ctxFor('u1'), next)).resolves.toBeUndefined();
  });

  it('works without the optional hooks', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const middleware = createNoticeMiddleware({ shouldNotify: () => true, notify });

    await middleware(ctxFor('u1'), vi.fn().mockResolvedValue(undefined));

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('shows one notice when the same user runs two commands at once', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { middleware, options } = setup({
      notify: vi.fn(async () => {
        await gate;
      }),
    });
    const next = vi.fn().mockResolvedValue(undefined);

    const first = middleware(ctxFor('u1'), next);
    const second = middleware(ctxFor('u1'), next);
    const other = middleware(ctxFor('u2'), next);
    await second;
    release();
    await Promise.all([first, other]);

    expect(options.notify).toHaveBeenCalledTimes(2);
    expect(options.notify).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ user: { id: 'u1' } }),
    );
    expect(options.notify).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user: { id: 'u2' } }),
    );
  });

  it('can show the notice again once the first one is done', async () => {
    const { middleware, options, next } = setup();

    await middleware(ctxFor('u1'), next);
    await middleware(ctxFor('u1'), next);

    expect(options.notify).toHaveBeenCalledTimes(2);
  });
});
