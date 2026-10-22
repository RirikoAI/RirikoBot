import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StarboardService } from '@ririko/services';
import { registerStarboardListener } from '../starboard.listener.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeService() {
  return {
    reactionChanged: vi.fn().mockResolvedValue(undefined),
    messageDeleted: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
}

describe('registerStarboardListener (TASK-2014)', () => {
  let client: EventEmitter;
  let service: ReturnType<typeof fakeService>;
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new EventEmitter();
    service = fakeService();
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerStarboardListener(client as unknown as Client, {
      starboardService: service as unknown as StarboardService,
    });
  });

  afterEach(() => {
    errors.mockRestore();
  });

  const message = { id: 'message-1', guildId: 'guild-1', partial: false };
  const user = { id: 'user-1' };

  /** The arguments discord.js passes for each reaction event, around the given message. */
  const argsFor = (event: string, target: object): unknown[] => {
    switch (event) {
      case 'messageReactionRemoveAll':
        return [target, new Map()];
      case 'messageReactionRemoveEmoji':
        return [{ message: target, emoji: { name: '⭐' } }];
      default:
        return [{ message: target, emoji: { name: '⭐' } }, user];
    }
  };

  const reactionEvents = [
    'messageReactionAdd',
    'messageReactionRemove',
    'messageReactionRemoveAll',
    'messageReactionRemoveEmoji',
  ];

  describe.each(reactionEvents)('%s', (event) => {
    it('passes a cached message to reactionChanged', async () => {
      client.emit(event, ...argsFor(event, message));
      await tick();

      expect(service.reactionChanged).toHaveBeenCalledTimes(1);
      expect(service.reactionChanged).toHaveBeenCalledWith(message);
      expect(service.messageDeleted).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    });

    it('fetches a partial message first and passes the full one', async () => {
      const full = { id: 'message-1', guildId: 'guild-1', partial: false, author: user };
      const fetch = vi.fn().mockResolvedValue(full);
      const partial = { id: 'message-1', guildId: 'guild-1', partial: true, fetch };

      client.emit(event, ...argsFor(event, partial));
      await tick();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(service.reactionChanged).toHaveBeenCalledTimes(1);
      expect(service.reactionChanged).toHaveBeenCalledWith(full);
    });

    it('drops the event when a partial message cannot be fetched', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Unknown Message'));
      const partial = { id: 'message-1', guildId: 'guild-1', partial: true, fetch };

      client.emit(event, ...argsFor(event, partial));
      await tick();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(service.reactionChanged).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    });

    it('skips direct messages without fetching', async () => {
      const fetch = vi.fn();
      const dm = { id: 'message-2', guildId: null, partial: true, fetch };

      client.emit(event, ...argsFor(event, dm));
      await tick();

      expect(fetch).not.toHaveBeenCalled();
      expect(service.reactionChanged).not.toHaveBeenCalled();
    });

    it('skips a fetched message that turns out to be a direct message', async () => {
      const fetch = vi.fn().mockResolvedValue({ id: 'message-3', guildId: null, partial: false });
      const partial = { id: 'message-3', guildId: 'guild-1', partial: true, fetch };

      client.emit(event, ...argsFor(event, partial));
      await tick();

      expect(service.reactionChanged).not.toHaveBeenCalled();
    });

    it('catches and logs an error thrown by the service', async () => {
      service.reactionChanged.mockRejectedValue(new Error('boom'));

      expect(() => client.emit(event, ...argsFor(event, message))).not.toThrow();
      await tick();

      expect(errors).toHaveBeenCalledWith(
        `[Starboard] Failed to handle ${event}:`,
        expect.any(Error),
      );
    });
  });

  describe('messageDelete', () => {
    it('passes the server and message IDs to messageDeleted', async () => {
      client.emit('messageDelete', message);
      await tick();

      expect(service.messageDeleted).toHaveBeenCalledTimes(1);
      expect(service.messageDeleted).toHaveBeenCalledWith('guild-1', 'message-1');
      expect(service.reactionChanged).not.toHaveBeenCalled();
    });

    it('works for a partial message that carries only its IDs', async () => {
      client.emit('messageDelete', { id: 'message-9', guildId: 'guild-1', partial: true });
      await tick();

      expect(service.messageDeleted).toHaveBeenCalledWith('guild-1', 'message-9');
    });

    it('skips direct messages', async () => {
      client.emit('messageDelete', { id: 'message-2', guildId: null });
      await tick();

      expect(service.messageDeleted).not.toHaveBeenCalled();
    });

    it('catches and logs an error thrown by the service', async () => {
      service.messageDeleted.mockRejectedValue(new Error('boom'));

      expect(() => client.emit('messageDelete', message)).not.toThrow();
      await tick();

      expect(errors).toHaveBeenCalledWith(
        '[Starboard] Failed to handle messageDelete:',
        expect.any(Error),
      );
    });
  });

  describe('messageDeleteBulk', () => {
    const channel = { id: 'channel-1', guildId: 'guild-1', isDMBased: () => false };

    it('calls messageDeleted once for every deleted message', async () => {
      const messages = new Map([
        ['message-1', { id: 'message-1' }],
        ['message-2', { id: 'message-2' }],
        ['message-3', { id: 'message-3' }],
      ]);

      client.emit('messageDeleteBulk', messages, channel);
      await tick();

      expect(service.messageDeleted).toHaveBeenCalledTimes(3);
      expect(service.messageDeleted).toHaveBeenNthCalledWith(1, 'guild-1', 'message-1');
      expect(service.messageDeleted).toHaveBeenNthCalledWith(2, 'guild-1', 'message-2');
      expect(service.messageDeleted).toHaveBeenNthCalledWith(3, 'guild-1', 'message-3');
    });

    it('skips direct channels', async () => {
      client.emit('messageDeleteBulk', new Map([['message-1', { id: 'message-1' }]]), {
        id: 'dm-1',
        isDMBased: () => true,
      });
      await tick();

      expect(service.messageDeleted).not.toHaveBeenCalled();
    });

    it('catches and logs an error thrown by the service', async () => {
      service.messageDeleted.mockRejectedValue(new Error('boom'));

      expect(() =>
        client.emit('messageDeleteBulk', new Map([['message-1', { id: 'message-1' }]]), channel),
      ).not.toThrow();
      await tick();

      expect(errors).toHaveBeenCalledWith(
        '[Starboard] Failed to handle messageDeleteBulk:',
        expect.any(Error),
      );
    });
  });

  it('an error in one handler does not stop the next event', async () => {
    service.messageDeleted.mockRejectedValueOnce(new Error('boom'));

    client.emit('messageDelete', message);
    client.emit('messageReactionAdd', ...argsFor('messageReactionAdd', message));
    await tick();

    expect(errors).toHaveBeenCalledTimes(1);
    expect(service.reactionChanged).toHaveBeenCalledTimes(1);
  });
});
