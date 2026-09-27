import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  WelcomerRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  BackgroundUploadError,
  WelcomerBackgroundStore,
} from '@ririko/services/welcomer-backgrounds';
import { WelcomerBackgroundService } from './welcomer-backgrounds';

const GUILD = '100000000000000001';
const actor = { userId: 'user-1', ipAddress: '203.0.113.7', userAgent: 'vitest' };

function png(width: number, height: number, seed = 0): Buffer {
  const buffer = Buffer.alloc(32, seed);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('WelcomerBackgroundService (TASK-1663)', () => {
  let db: SqliteDatabaseClient;
  let dir: string;
  let welcomer: WelcomerRepository;
  let service: WelcomerBackgroundService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    dir = await mkdtemp(path.join(tmpdir(), 'ririko-web-bg-'));
    welcomer = new WelcomerRepository(db);
    service = new WelcomerBackgroundService({
      db,
      welcomer,
      store: new WelcomerBackgroundStore(dir),
      audit: new AuditLogRepository(db),
    });
  });

  afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('points the card at the upload, drops its link and deletes the old upload', async () => {
    await welcomer.setWelcomeConfig({
      guildId: GUILD,
      channelId: '300000000000000001',
      messageTemplate: 'Hi {user}',
      cardTheme: 'DEFAULT',
      backgroundUrl: 'https://example.com/old.png',
      backgroundFile: null,
      textColor: '#ff0000',
      isEnabled: true,
    });

    await service.upload(GUILD, 'welcome', png(10, 10, 1), actor);
    await service.upload(GUILD, 'welcome', png(10, 10, 2), actor);

    const row = await welcomer.getWelcomeConfig(GUILD);
    expect(row).toMatchObject({
      backgroundUrl: null,
      messageTemplate: 'Hi {user}',
      isEnabled: true,
    });
    expect(await readdir(dir)).toEqual([row!.backgroundFile]);
    const actions = db.raw.prepare('SELECT action FROM audit_logs').all() as { action: string }[];
    expect(actions.map((a) => a.action)).toEqual([
      'welcomer.welcome.background_upload',
      'welcomer.welcome.background_upload',
    ]);
  });

  it('keeps an upload for a card that is not set up yet, turned off', async () => {
    await service.upload(GUILD, 'farewell', png(8, 8), actor);
    expect(await welcomer.getFarewellConfig(GUILD)).toMatchObject({
      channelId: '',
      isEnabled: false,
      messageTemplate: 'Goodbye {user}!',
    });
  });

  it('refuses a file that is not an image without touching the card', async () => {
    await expect(
      service.upload(GUILD, 'welcome', Buffer.from('<html></html>'), actor),
    ).rejects.toThrow(BackgroundUploadError);
    expect(await welcomer.getWelcomeConfig(GUILD)).toBeNull();
  });

  it('removes the background and its file', async () => {
    await service.upload(GUILD, 'welcome', png(8, 8), actor);
    await service.remove(GUILD, 'welcome', actor);
    expect(await welcomer.getWelcomeConfig(GUILD)).toMatchObject({
      backgroundUrl: null,
      backgroundFile: null,
    });
    expect(await readdir(dir)).toEqual([]);
  });
});
