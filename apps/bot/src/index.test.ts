import { describe, it, expect } from 'vitest';
import { createBot, getBotInfo } from './index.js';
import { Client } from 'discord.js';
import { GatewayManager } from '@ririko/discord';

describe('apps/bot Bootstrapper', () => {
  it('returns package and version info', () => {
    const info = getBotInfo();
    expect(info.version).toBe('2.0.0');
    expect(info.database).toBe('@ririko/database');
    expect(info.discord).toBe('@ririko/discord');
  });

  it('creates a BotInstance with configured client and gateway manager', () => {
    const bot = createBot();
    expect(bot.client).toBeInstanceOf(Client);
    expect(bot.gateway).toBeInstanceOf(GatewayManager);
    expect(bot.gateway.state).toBe('DISCONNECTED');
  });
});
