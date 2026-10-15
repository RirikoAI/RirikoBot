import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { BOT_INVITE_PERMISSIONS } from './index.js';

describe('BOT_INVITE_PERMISSIONS', () => {
  it('is the 1.4.0 invite set and does not include Administrator', () => {
    expect(BOT_INVITE_PERMISSIONS).toBe(626721090433015n);
    expect(BOT_INVITE_PERMISSIONS & PermissionFlagsBits.Administrator).toBe(0n);
  });
});
