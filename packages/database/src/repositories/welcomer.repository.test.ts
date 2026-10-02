import { it, expect, beforeEach } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { WelcomerRepository } from './welcomer.repository.js';

describeDialects('WelcomerRepository', (db) => {
  let repo: WelcomerRepository;

  beforeEach(() => {
    repo = new WelcomerRepository(db.client);
  });

  const card = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageTemplate: 'Welcome to {server}, {user}!',
    cardTheme: 'DEFAULT',
    backgroundUrl: 'https://example.test/bg.png',
    backgroundFile: null,
    textColor: '#ffffff',
    isEnabled: true,
  };

  it('returns null for a guild without a welcome or farewell card', async () => {
    expect(await repo.getWelcomeConfig('guild-1')).toBeNull();
    expect(await repo.getFarewellConfig('guild-1')).toBeNull();
  });

  it('creates and then updates the welcome card in place', async () => {
    expect(await repo.setWelcomeConfig(card)).toEqual(card);

    const updated = { ...card, channelId: 'channel-2', backgroundUrl: null, isEnabled: false };
    expect(await repo.setWelcomeConfig(updated)).toEqual(updated);
    expect(await repo.getWelcomeConfig('guild-1')).toEqual(updated);
  });

  it('keeps the farewell card separate from the welcome card', async () => {
    const farewell = { ...card, messageTemplate: 'Goodbye {user}!', channelId: 'channel-3' };
    await repo.setWelcomeConfig(card);
    expect(await repo.setFarewellConfig(farewell)).toEqual(farewell);

    await repo.setFarewellConfig({
      ...farewell,
      backgroundFile: 'guild-1.png',
      backgroundUrl: null,
    });
    expect(await repo.getFarewellConfig('guild-1')).toMatchObject({
      backgroundFile: 'guild-1.png',
      backgroundUrl: null,
    });
    expect(await repo.getWelcomeConfig('guild-1')).toEqual(card);
  });
});
