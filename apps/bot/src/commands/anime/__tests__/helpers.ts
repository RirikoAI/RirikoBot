import { EventEmitter } from 'node:events';
import { vi, type Mock } from 'vitest';
import type { CommandContext } from '@ririko/discord';

export interface MockCollector extends EventEmitter {
  resetTimer: Mock;
}

export interface MockMessage {
  createMessageComponentCollector: Mock;
  edit: Mock;
}

export interface MockContextParts {
  commandName: string;
  user: { id: string };
  channel: { nsfw: boolean };
  options: { getString: Mock };
  reply: Mock;
  deferReply: Mock;
  editReply: Mock;
}

export interface MockComponentInteraction {
  customId: string;
  values?: string[];
  user: { id: string };
  isStringSelectMenu: () => boolean;
  reply: Mock;
  deferUpdate: Mock;
  update?: Mock;
  editReply: Mock;
  followUp: Mock;
}

/** Command context whose editReply resolves to a message with a controllable collector. */
export function makeContext(
  search: string | null,
  options: { nsfw?: boolean; userId?: string } = {},
): { ctx: CommandContext; raw: MockContextParts; collector: MockCollector; message: MockMessage } {
  const collector = Object.assign(new EventEmitter(), { resetTimer: vi.fn() });
  const message = {
    createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    edit: vi.fn().mockResolvedValue(undefined),
  };
  const ctx = {
    commandName: 'anime',
    user: { id: options.userId ?? 'user-1' },
    channel: { nsfw: options.nsfw ?? false },
    options: { getString: vi.fn().mockReturnValue(search) },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(message),
  };
  return { ctx: ctx as unknown as CommandContext, raw: ctx, collector, message };
}

export function selectInteraction(value: string, userId = 'user-1'): MockComponentInteraction {
  return {
    customId: 'anime:select',
    values: [value],
    user: { id: userId },
    isStringSelectMenu: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

export function buttonInteraction(customId: string, userId = 'user-1'): MockComponentInteraction {
  return {
    customId,
    user: { id: userId },
    isStringSelectMenu: () => false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

export const flush = (): Promise<unknown> => new Promise((resolve) => setImmediate(resolve));
