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
    textMessageEnabled: false,
    textMessage: '',
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

  it('stores the text message on and off, and keeps the message when it is turned off', async () => {
    const withText = { ...card, textMessageEnabled: true, textMessage: 'Read #rules, {user}!' };
    expect(await repo.setWelcomeConfig(withText)).toEqual(withText);
    expect(await repo.getWelcomeConfig('guild-1')).toEqual(withText);

    const off = { ...withText, textMessageEnabled: false };
    await repo.setWelcomeConfig(off);
    expect(await repo.getWelcomeConfig('guild-1')).toEqual(off);

    const farewell = { ...card, textMessageEnabled: true, textMessage: 'Bye {username}' };
    await repo.setFarewellConfig(farewell);
    expect(await repo.getFarewellConfig('guild-1')).toEqual(farewell);
    expect(await repo.getWelcomeConfig('guild-1')).toEqual(off);
  });

  it('gives a row written without the text columns the defaults (off, empty)', async () => {
    // A row as it was before the columns existed: the migration's defaults fill them in.
    const insert =
      'INSERT INTO %t (guild_id, channel_id, message_template, card_theme, text_color, is_enabled)';
    for (const table of ['guild_welcomer', 'guild_farewell']) {
      const columns = insert.replace('%t', table);
      if (db.client.dialect === 'sqlite') {
        db.client.raw.exec(
          `${columns} VALUES ('guild-9', 'channel-9', 'Hi', 'DEFAULT', '#ffffff', 1)`,
        );
      } else {
        await db.client.raw.query(
          `${columns} VALUES ('guild-9', 'channel-9', 'Hi', 'DEFAULT', '#ffffff', true)`,
        );
      }
    }
    expect(await repo.getWelcomeConfig('guild-9')).toMatchObject({
      textMessageEnabled: false,
      textMessage: '',
    });
    expect(await repo.getFarewellConfig('guild-9')).toMatchObject({
      textMessageEnabled: false,
      textMessage: '',
    });
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
