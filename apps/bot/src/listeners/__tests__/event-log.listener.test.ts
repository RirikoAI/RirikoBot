import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventLogService } from '@ririko/services';
import { registerEventLogListener } from '../event-log.listener.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

type Method = Exclude<keyof EventLogService, 'invalidate'>;

const METHODS: Method[] = [
  'messageEdited',
  'messageDeleted',
  'messagesBulkDeleted',
  'memberJoined',
  'memberLeft',
  'memberUpdated',
  'memberBanned',
  'memberUnbanned',
  'channelCreated',
  'channelDeleted',
  'channelUpdated',
  'roleCreated',
  'roleDeleted',
  'roleUpdated',
  'voiceStateChanged',
];

function fakeService() {
  return Object.fromEntries(
    METHODS.map((name) => [name, vi.fn().mockResolvedValue(undefined)]),
  ) as {
    [K in Method]: ReturnType<typeof vi.fn>;
  };
}

describe('registerEventLogListener (TASK-1994)', () => {
  let client: EventEmitter;
  let service: ReturnType<typeof fakeService>;
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new EventEmitter();
    service = fakeService();
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerEventLogListener(client as unknown as Client, {
      eventLogService: service as unknown as EventLogService,
    });
  });

  afterEach(() => {
    errors.mockRestore();
  });

  const guildMessage = { guildId: 'guild-1', id: 'message-1' };
  const guildChannel = { id: 'channel-1', isDMBased: () => false };
  const dmChannel = { id: 'dm-1', isDMBased: () => true };

  const cases: { event: string; args: unknown[]; method: Method }[] = [
    { event: 'messageUpdate', args: [guildMessage, guildMessage], method: 'messageEdited' },
    { event: 'messageDelete', args: [guildMessage], method: 'messageDeleted' },
    {
      event: 'messageDeleteBulk',
      args: [new Map([['message-1', guildMessage]]), guildChannel],
      method: 'messagesBulkDeleted',
    },
    { event: 'guildMemberAdd', args: [{ id: 'user-1' }], method: 'memberJoined' },
    { event: 'guildMemberRemove', args: [{ id: 'user-1' }], method: 'memberLeft' },
    {
      event: 'guildMemberUpdate',
      args: [{ id: 'user-1' }, { id: 'user-1' }],
      method: 'memberUpdated',
    },
    { event: 'guildBanAdd', args: [{ user: { id: 'user-1' } }], method: 'memberBanned' },
    { event: 'guildBanRemove', args: [{ user: { id: 'user-1' } }], method: 'memberUnbanned' },
    { event: 'channelCreate', args: [guildChannel], method: 'channelCreated' },
    { event: 'channelDelete', args: [guildChannel], method: 'channelDeleted' },
    { event: 'channelUpdate', args: [guildChannel, guildChannel], method: 'channelUpdated' },
    { event: 'roleCreate', args: [{ id: 'role-1' }], method: 'roleCreated' },
    { event: 'roleDelete', args: [{ id: 'role-1' }], method: 'roleDeleted' },
    { event: 'roleUpdate', args: [{ id: 'role-1' }, { id: 'role-1' }], method: 'roleUpdated' },
    {
      event: 'voiceStateUpdate',
      args: [{ id: 'old' }, { id: 'new' }],
      method: 'voiceStateChanged',
    },
  ];

  it('covers every EventLogService method', () => {
    expect(new Set(cases.map((c) => c.method))).toEqual(new Set(METHODS));
  });

  it.each(cases)('forwards $event to $method with the same arguments', async (c) => {
    client.emit(c.event, ...c.args);
    await tick();

    expect(service[c.method]).toHaveBeenCalledTimes(1);
    expect(service[c.method]).toHaveBeenCalledWith(...c.args);
    for (const other of METHODS.filter((name) => name !== c.method)) {
      expect(service[other]).not.toHaveBeenCalled();
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it.each(cases)('catches and logs an error thrown while handling $event', async (c) => {
    service[c.method].mockRejectedValue(new Error('boom'));

    expect(() => client.emit(c.event, ...c.args)).not.toThrow();
    await tick();

    expect(errors).toHaveBeenCalledWith(`[EventLog] Failed to log ${c.event}:`, expect.any(Error));
  });

  it('an error in one handler does not stop the next event', async () => {
    service.messageDeleted.mockRejectedValueOnce(new Error('boom'));

    client.emit('messageDelete', guildMessage);
    client.emit('roleCreate', { id: 'role-1' });
    await tick();

    expect(errors).toHaveBeenCalledTimes(1);
    expect(service.roleCreated).toHaveBeenCalledTimes(1);
  });

  it('skips direct messages before calling the service', async () => {
    const dm = { guildId: null, id: 'message-2' };
    client.emit('messageUpdate', dm, dm);
    client.emit('messageDelete', dm);
    await tick();

    expect(service.messageEdited).not.toHaveBeenCalled();
    expect(service.messageDeleted).not.toHaveBeenCalled();
  });

  it('skips direct message channels before calling the service', async () => {
    client.emit('messageDeleteBulk', new Map(), dmChannel);
    client.emit('channelDelete', dmChannel);
    client.emit('channelUpdate', dmChannel, guildChannel);
    client.emit('channelUpdate', guildChannel, dmChannel);
    await tick();

    expect(service.messagesBulkDeleted).not.toHaveBeenCalled();
    expect(service.channelDeleted).not.toHaveBeenCalled();
    expect(service.channelUpdated).not.toHaveBeenCalled();
  });
});
