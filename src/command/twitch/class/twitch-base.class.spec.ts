import { EmbedBuilder } from 'discord.js';
import { TwitchBaseCommand } from './twitch-base.class';

class TestTwitchCommand extends TwitchBaseCommand {}

describe('TwitchBaseCommand', () => {
  let command: TestTwitchCommand;

  beforeEach(() => {
    command = new TestTwitchCommand(jest.fn() as any);
  });

  it('should create an embed with error message', () => {
    const params = { message: 'Error occurred', isError: true };
    const embed = command.prepareEmbed(params);

    expect(embed).toBeInstanceOf(EmbedBuilder);
    expect(embed.data.title).toBe('Ririko Twitch Service');
    expect(embed.data.description).toBe(params.message);
    expect(embed.data.color).toBe(0xff0000);
  });

  it('should create an embed with success message', () => {
    const params = { message: 'Operation successful', isError: false };
    const embed = command.prepareEmbed(params);

    expect(embed).toBeInstanceOf(EmbedBuilder);
    expect(embed.data.title).toBe('Ririko Twitch Service');
    expect(embed.data.description).toBe(params.message);
    expect(embed.data.color).toBe(0x00ff00);
  });
});
