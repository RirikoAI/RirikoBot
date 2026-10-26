import { describe, expect, it } from 'vitest';
import {
  DEMO_CARDS,
  aiAnswer,
  dailyReward,
  demoTrack,
  dropCard,
  findCommand,
  formatDuration,
  greetingReply,
  helpHome,
  inspectCommand,
  optionSignature,
  parseInput,
  parseOptions,
  playerMessage,
  progressBar,
  replyTo,
  suggestCommands,
  textHint,
  walletOf,
  type DemoCatalog,
  type DemoContext,
  type Outcome,
} from '../website/src/components/DiscordDemo/reply.js';
import { INITIAL_STATE, type DemoState } from '../website/src/components/DiscordDemo/types.js';

const catalog: DemoCatalog = {
  prefix: '!',
  categories: [
    { id: 'general', label: 'General', emoji: '✨', description: 'General commands' },
    { id: 'music', label: 'Music & Audio', emoji: '🎵', description: 'Audio playback' },
    { id: 'empty', label: 'Empty', emoji: '🫥', description: 'No commands here' },
  ],
  commands: [
    {
      name: 'help',
      category: 'general',
      description: 'Shows help.',
      aliases: ['h'],
      usage: '/help [command]',
      options: [{ name: 'command', description: 'Command', type: 'STRING', required: false }],
    },
    {
      name: 'play',
      category: 'music',
      description: 'Plays music.',
      aliases: ['p'],
      usage: '/play <query>',
      options: [{ name: 'query', description: 'Song', type: 'STRING', required: true }],
    },
    {
      name: 'nowplaying',
      category: 'music',
      description: 'Now playing.',
      aliases: ['np'],
      usage: null,
      options: [],
    },
    {
      name: 'ping',
      category: 'general',
      description: 'Latency.',
      aliases: [],
      usage: null,
      options: [],
    },
    {
      name: 'ai',
      category: 'general',
      description: 'Chat.',
      aliases: ['ask'],
      usage: null,
      options: [],
    },
    {
      name: 'chat',
      category: 'general',
      description: 'Chat.',
      aliases: ['c'],
      usage: null,
      options: [],
    },
    {
      name: 'daily',
      category: 'general',
      description: 'Reward.',
      aliases: ['d'],
      usage: null,
      options: [],
    },
    {
      name: 'queue',
      category: 'music',
      description: 'Queue.',
      aliases: ['q'],
      usage: null,
      options: [],
    },
    {
      name: 'balance',
      category: 'general',
      description: 'Balance.',
      aliases: ['bal'],
      usage: null,
      options: [],
    },
    {
      name: 'leaderboard',
      category: 'general',
      description: 'Ranking.',
      aliases: ['lb'],
      usage: null,
      options: [],
    },
    {
      name: 'warn',
      category: 'general',
      description: 'Warn.',
      aliases: ['w'],
      usage: null,
      options: [],
    },
    {
      name: 'card',
      category: 'general',
      description: 'Cards.',
      aliases: ['tcg'],
      usage: null,
      options: [],
    },
    {
      name: 'get-avatar',
      category: 'general',
      description: 'Shows an avatar.',
      aliases: ['avatar'],
      usage: '/get-avatar [user]',
      examples: ['/get-avatar', '!avatar @Aiko'],
      permissions: ['SendMessages'],
      cooldownSeconds: 3,
      options: [{ name: 'user', description: 'Whose avatar', type: 'USER', required: false }],
    },
    {
      name: 'prefix-only',
      category: 'general',
      description: 'No slash form.',
      aliases: [],
      usage: null,
      options: [],
      slash: false,
    },
  ],
};

const you: DemoContext = { author: 'you', now: Date.UTC(2026, 9, 16, 12, 0, 0) };
const aiko: DemoContext = { author: 'aiko', now: you.now };

function command(outcome: Outcome): Extract<Outcome, { kind: 'command' }> {
  if (outcome.kind !== 'command') throw new Error(`expected a command, got ${outcome.kind}`);
  return outcome;
}

function run(input: string, state: DemoState = INITIAL_STATE, context = you) {
  return command(replyTo(input, catalog, state, context));
}

describe('parseInput', () => {
  it('reads the slash and the prefix', () => {
    expect(parseInput('/Play lofi beats', '!')).toEqual({
      trigger: '/',
      word: 'play',
      args: 'lofi beats',
    });
    expect(parseInput('  !avatar', '!')).toEqual({ trigger: '!', word: 'avatar', args: '' });
  });
  it('rejects text without a trigger', () => {
    expect(parseInput('hello', '!')).toBeNull();
    expect(parseInput('!x', '')).toBeNull();
  });
});

describe('parseOptions', () => {
  it('reads name:value pairs and keeps plain arguments', () => {
    expect(parseOptions('action:claim')).toEqual({ rest: '', named: { action: 'claim' } });
    expect(parseOptions('prompt:hi there model:x')).toEqual({
      rest: '',
      named: { prompt: 'hi there', model: 'x' },
    });
    expect(parseOptions('lofi beats')).toEqual({ rest: 'lofi beats', named: {} });
  });
});

describe('findCommand and suggestCommands', () => {
  it('matches names and aliases', () => {
    expect(findCommand('p', catalog)?.name).toBe('play');
    expect(findCommand('avatar', catalog)?.name).toBe('get-avatar');
    expect(findCommand('nope', catalog)).toBeUndefined();
  });
  it('lists prefix matches before partial matches', () => {
    expect(suggestCommands('/p', catalog).map((c) => c.name)).toEqual([
      'play',
      'ping',
      'help',
      'nowplaying',
    ]);
    expect(suggestCommands('/', catalog)).toHaveLength(5);
    expect(suggestCommands('/vatar', catalog).map((c) => c.name)).toEqual(['get-avatar']);
  });
  it('offers only slash commands after /, every command after the prefix', () => {
    expect(suggestCommands('/prefix', catalog)).toEqual([]);
    expect(suggestCommands('!prefix', catalog).map((c) => c.name)).toEqual(['prefix-only']);
  });
  it('is empty once arguments start or the text is not a command', () => {
    expect(suggestCommands('/play lofi', catalog)).toEqual([]);
    expect(suggestCommands('/play ', catalog)).toEqual([]);
    expect(suggestCommands('hi', catalog)).toEqual([]);
  });
  it('writes option signatures like the help inspector', () => {
    expect(optionSignature(findCommand('play', catalog)!)).toBe('<query>');
    expect(optionSignature(findCommand('get-avatar', catalog)!)).toBe('[user]');
    expect(optionSignature(findCommand('ping', catalog)!)).toBe('');
  });
});

describe('replyTo: chat and unknown input', () => {
  it('ignores empty input', () => {
    expect(replyTo('   ', catalog, INITIAL_STATE, you)).toEqual({ kind: 'empty' });
  });
  it('hints the visitor when there is no slash or prefix, and stays quiet for members', () => {
    const outcome = replyTo('hello', catalog, INITIAL_STATE, you);
    expect(outcome).toMatchObject({ kind: 'text', mention: false });
    if (outcome.kind !== 'text') throw new Error('text expected');
    expect(outcome.reply?.ephemeral).toBe(true);
    expect(outcome.reply?.content).toContain('/help');
    expect(replyTo('hello', catalog, INITIAL_STATE, aiko)).toEqual({
      kind: 'text',
      reply: null,
      mention: false,
    });
  });
  it('answers a mention of Ririko with a chat reply', () => {
    const outcome = replyTo('@Ririko can you play music?', catalog, INITIAL_STATE, aiko);
    expect(outcome).toMatchObject({ kind: 'text', mention: true });
    if (outcome.kind !== 'text') throw new Error('text expected');
    expect(outcome.reply?.content).toBe(aiAnswer('can you play music?'));
    expect(outcome.reply?.content).toContain('/play');
  });
  it('gives an ephemeral hint for unknown commands, with suggestions when close', () => {
    const close = replyTo('/pla', catalog, INITIAL_STATE, you);
    expect(close).toMatchObject({ kind: 'unknown', trigger: '/', word: 'pla' });
    if (close.kind !== 'unknown') throw new Error('unknown expected');
    expect(close.reply.ephemeral).toBe(true);
    expect(close.reply.content).toContain('`/play`');
    const far = replyTo('!zzz', catalog, INITIAL_STATE, you);
    if (far.kind !== 'unknown') throw new Error('unknown expected');
    expect(far.reply.content).toContain('`!help`');
  });
});

describe('replyTo: showcase commands mirror the bot', () => {
  it('ping uses the bot wording', () => {
    const { reply, name, trigger } = run('!ping');
    expect(name).toBe('ping');
    expect(trigger).toBe('!');
    expect(reply.content).toMatch(/^🏓 \*\*Pong!\*\*\n• Gateway Latency: `\d+ms`/);
    expect(reply.content).toContain('• Bot Version: `v2.1.2`');
  });

  it('help shows the Help Center home with one inline field per used category', () => {
    const { reply } = run('/help');
    const embed = reply.embeds[0]!;
    expect(embed.title).toBe('✨ Ririko AI 2.0 — Interactive Help Center');
    expect(embed.color).toBe(0x5865f2);
    expect(embed.fields).toEqual([
      { name: '✨ General (11)', value: 'General commands', inline: true },
      { name: '🎵 Music & Audio (3)', value: 'Audio playback', inline: true },
    ]);
    expect(embed.footer).toBe('Prefix: ! • Total Commands: 14 • Ririko AI 2.0.0');
    expect(reply.rows).toEqual([
      { type: 'select', placeholder: 'Select a category to browse commands...' },
    ]);
    expect(helpHome(catalog)).toEqual(reply);
  });

  it('help with a command opens the Command Inspector', () => {
    const named = run('/help command:avatar').reply;
    const positional = run('!help get-avatar').reply;
    expect(named).toEqual(positional);
    expect(named.embeds[0]?.title).toBe('Command Inspector: /get-avatar');
    expect(run('/help nothing-like-it').reply.embeds[0]?.title).toContain('Help Center');
  });

  it('play answers Now Playing for the first track and brings up the player, then Added to Queue', () => {
    const first = run('/play lofi hip hop radio');
    const embed = first.reply.embeds[0]!;
    expect(embed.title).toBe('🎵 Now Playing');
    expect(embed.description).toBe('**[Lofi Hip Hop Radio](https://ririko.ai)**');
    expect(embed.fields.map((f) => [f.name, f.inline])).toEqual([
      ['Artist', true],
      ['Duration', true],
      ['Position', true],
    ]);
    expect(embed.fields[2]?.value).toBe('Now Playing');
    expect(embed.thumbnail).toEqual({ type: 'cover', title: 'Lofi Hip Hop Radio' });
    expect(first.state.queue).toHaveLength(1);
    expect(first.reply.followUp).toEqual(playerMessage(first.state));

    const second = run('!p query:city pop', first.state, aiko);
    expect(second.reply.embeds[0]?.title).toBe('➕ Added to Queue');
    expect(second.reply.embeds[0]?.fields[2]?.value).toBe('#1');
    expect(second.reply.followUp).toBeUndefined();
    expect(second.state.queue[1]?.requestedBy).toBe('aiko');
  });

  it('the player message follows the bot controller: slider, time boxes, settings, buttons', () => {
    const state = run('/play lofi hip hop radio').state;
    const seconds = state.queue[0]!.seconds;
    const player = playerMessage(state);
    const embed = player.embeds[0]!;
    expect(embed.title).toBe('[🎵 Lofi Hip Hop Radio](https://ririko.ai)');
    expect(embed.color).toBe(0x5865f2);
    expect(embed.description).toBe(
      `${progressBar(0, seconds, 14)}\n\`0:00\` / \`${formatDuration(seconds)}\`\n▶️ *Now Playing*`,
    );
    expect(embed.fields.map((f) => [f.name, f.inline])).toEqual([
      ['👤 Artist', true],
      ['🎧 Requester', true],
      ['🌐 Source', true],
      ['🎛️ Settings', false],
    ]);
    expect(embed.fields[1]?.value).toBe('<@You>');
    expect(embed.fields[3]?.value).toBe(
      'Volume: **80%** • Loop: **OFF** • Filters: **None** • Queue: **1** (Upcoming: **0**)',
    );
    expect(embed.footer).toBe('Ririko Music 2.0 • Zero-Polling Reactive UI');
    expect(embed.timestamp).toBe(true);
    const [row1, row2] = player.rows;
    if (row1?.type !== 'buttons' || row2?.type !== 'buttons') throw new Error('buttons expected');
    expect(row1.buttons.map((b) => [b.emoji, b.style, b.disabled ?? false])).toEqual([
      ['⏮️', 'primary', true],
      ['⏸️', 'primary', false],
      ['⏭️', 'primary', true],
      ['🛑', 'danger', false],
      ['🔇', 'secondary', false],
    ]);
    expect(row1.buttons.every((b) => b.iconOnly)).toBe(true);
    expect(row2.buttons.map((b) => b.label)).toEqual([
      'Loop: Off',
      'Shuffle',
      'Lyrics',
      'Queue (1)',
      'Refresh',
    ]);
    expect(row2.buttons[1]?.disabled).toBe(true);
    expect(row2.buttons[3]?.action).toEqual({ type: 'send', input: '/queue' });
    // With two tracks the player allows next and shuffle, and counts the queue.
    const two = run('/play city pop', state, aiko).state;
    const [two1, two2] = playerMessage(two).rows;
    if (two1?.type !== 'buttons' || two2?.type !== 'buttons') throw new Error('buttons expected');
    expect(two1.buttons[2]?.disabled).toBeFalsy();
    expect(two2.buttons[1]?.disabled).toBe(false);
    expect(two2.buttons[3]?.label).toBe('Queue (2)');
    expect(playerMessage(INITIAL_STATE).content).toBe('⚠️ Nothing is currently playing.');
  });

  it('queue lists the current track and the upcoming ones like the bot', () => {
    expect(run('/queue').reply.content).toBe('📜 The music queue is currently empty.');
    const one = run('/play lofi', INITIAL_STATE, aiko).state;
    const single = run('/queue', one).reply.embeds[0]!;
    expect(single.title).toBe('📜 Music Queue (1 track)');
    expect(single.fields).toEqual([
      { name: 'Upcoming', value: '*No upcoming tracks in queue.*', inline: false },
    ]);
    const two = run('/play city pop', one, you).state;
    const embed = run('!q', two).reply.embeds[0]!;
    expect(embed.title).toBe('📜 Music Queue (2 tracks)');
    expect(embed.description).toContain('**Now Playing:**\n🎶 **[Lofi](https://ririko.ai)**');
    expect(embed.description).toContain('(Requested by: <@Aiko>)');
    expect(embed.description?.endsWith('**Upcoming Tracks:**')).toBe(true);
    expect(embed.fields[0]?.name).toBe('Queue');
    expect(embed.fields[0]?.value).toMatch(
      /^`1\.` \*\*\[City Pop\]\(https:\/\/ririko\.ai\)\*\* \| `\d+:\d{2}` \(by <@You>\)$/,
    );
    expect(embed.footer).toMatch(/^Total: 2 tracks \| Total Duration: \d+:\d{2} \| Loop: OFF$/);
  });

  it('play without a query uses the bot error', () => {
    const outcome = run('/play');
    expect(outcome.reply.content).toBe('❌ Please provide a song title or URL to play.');
    expect(outcome.state).toBe(INITIAL_STATE);
  });

  it('nowplaying shows the current track, or the bot message when idle', () => {
    expect(run('/np').reply.content).toBe('⚠️ Nothing is currently playing.');
    const playing = run('/play lofi', INITIAL_STATE, aiko).state;
    const embed = run('/nowplaying', playing).reply.embeds[0]!;
    expect(embed.title).toBe('🎵 Now Playing');
    expect(embed.description).toContain('🔘');
    expect(embed.fields.map((f) => f.name)).toEqual([
      'Artist',
      'Volume',
      'Loop Mode',
      'Requested By',
      'Source',
      'Active Filters',
    ]);
    expect(embed.fields[3]?.value).toBe('Aiko');
  });

  it('daily claims once per member with the default rewards, then shows the cooldown', () => {
    const first = run('/daily');
    expect(first.reply.content).toBe(
      '🎉 **Daily Reward Claimed!**\n• Awarded: **+250 credits**\n• Consecutive Streak: **1 days** (+0% bonus)\n• Wallet Balance: **250 credits**',
    );
    expect(first.state.dailyClaimed).toEqual(['you']);
    const again = run('!d', first.state);
    expect(again.reply.content).toBe(
      '⏳ **Daily Reward Cooldown**\nDaily reward already claimed today. Resets in 43200s.',
    );
    const aikoClaim = run('!daily', first.state, aiko);
    expect(aikoClaim.reply.content).toContain('+388 credits');
    expect(aikoClaim.reply.content).toContain('**12 days** (+55% bonus)');
    expect(aikoClaim.reply.content).toContain('**4,388 credits**');
  });

  it('balance shows wallet, bank and net worth, and follows the daily reward', () => {
    expect(run('/balance').reply.content).toBe(
      "🪙 **guest's Financial Balance**\n• **Wallet**: `0 credits`\n• **Bank**: `0 / 17,500 credits`\n• **Net Worth**: `0 credits`",
    );
    const claimed = run('/daily').state;
    expect(walletOf('you', claimed)).toBe(250);
    expect(run('!bal', claimed).reply.content).toContain('• **Wallet**: `250 credits`');
    const members = run('/balance', INITIAL_STATE, aiko).reply.content;
    expect(members).toContain('• **Wallet**: `4,000 credits`');
    expect(members).toContain('`0 / 87,500 credits`');
  });

  it('leaderboard ranks the made-up members and can switch to the global title', () => {
    const { reply } = run('/leaderboard');
    expect(reply.content).toMatch(
      /^🏆 \*\*Ririko Café Leaderboard\*\* \(Page 1\/1\)\n\n`# 1` <@Aiko> — \*\*LVL 31\*\* \(96,310 XP\)\n`# 2` <@Hana>/,
    );
    expect(reply.content).toContain('`# 4` <@You>');
    expect(run('!lb scope:global').reply.content).toContain('🏆 **Global Leveling Leaderboard**');
    expect(run('!lb global').reply.content).toContain('Global Leveling Leaderboard');
  });

  it('warn issues a case with the bot embed and walks up the default escalation policy', () => {
    const first = run('/warn user:Kenji reason:being loud');
    const embed = first.reply.embeds[0]!;
    expect(embed.title).toBe('⚠️ Warning Issued — Case #1');
    expect(embed.color).toBe(0xf1c40f);
    expect(embed.timestamp).toBe(true);
    expect(embed.fields.map((f) => [f.name, f.inline])).toEqual([
      ['Target Member', true],
      ['Moderator', true],
      ['Severity', true],
      ['Reason', false],
      ['Active Warnings Summary', true],
      ['DM Notification', true],
      ['🚨 Automatic Escalation Triggered!', false],
    ]);
    expect(embed.fields[0]?.value).toBe('<@Kenji> (kenji)');
    expect(embed.fields[1]?.value).toBe('<@You>');
    expect(embed.fields[3]?.value).toBe('being loud');
    expect(embed.fields[4]?.value).toBe('• Active Warnings: **1**\n• Cumulative Score: **1 pts**');
    expect(embed.fields[5]?.value).toBe('✅ Delivered');
    expect(embed.fields[6]?.value).toBe('Infraction threshold reached step: **WARN**');
    expect(first.state).toMatchObject({ warns: 1, warnScore: 1 });

    const second = run('!w Hana spam spam', first.state, aiko);
    const next = second.reply.embeds[0]!;
    expect(next.title).toBe('⚠️ Warning Issued — Case #2');
    expect(next.fields[0]?.value).toBe('<@Hana> (hana)');
    expect(next.fields[1]?.value).toBe('<@Aiko>');
    expect(next.fields[3]?.value).toBe('spam spam');

    // Severity is capped at 5, which lifts the score to the ban step; a blocked DM is reported.
    const heavy = run('/warn user:Kenji reason:x severity:9 send_dm:false', second.state);
    const heavyEmbed = heavy.reply.embeds[0]!;
    expect(heavyEmbed.fields[2]?.value).toBe('5');
    expect(heavyEmbed.fields[5]?.value).toBe('⚠️ Blocked / Failed');
    expect(heavyEmbed.fields[6]?.value).toBe('Infraction threshold reached step: **BAN**');
  });

  it('warn shows the timeout length of the step it reaches', () => {
    let state = INITIAL_STATE;
    const steps: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const outcome = run('/warn user:Kenji reason:x', state);
      state = outcome.state;
      steps.push(outcome.reply.embeds[0]?.fields[6]?.value ?? '');
    }
    expect(steps.map((step) => step.replace('Infraction threshold reached step: ', ''))).toEqual([
      '**WARN**',
      '**WARN**',
      '**TIMEOUT** (10 minutes)',
      '**TIMEOUT** (1 hours)',
      '**TIMEOUT** (1 days)',
    ]);
  });

  it('warn falls back to a demo target and reason, and strips mention brackets', () => {
    const embed = run('/warn').reply.embeds[0]!;
    expect(embed.fields[0]?.value).toBe('<@Kenji> (kenji)');
    expect(embed.fields[3]?.value).toBe('Spamming in the chat');
    const odd = run('/warn user:<@x>> reason:ok').reply.embeds[0]!;
    expect(odd.fields[0]?.value).toBe('<@x> (x)');
  });

  it('ai greets without a prompt by name, and chat and ai answer with one', () => {
    expect(run('/ai').reply.content).toBe('Heyyy friend! 👋✨\nHow can I help you today, senpai?');
    expect(run('/ai', INITIAL_STATE, aiko).reply.content).toBe(
      'Heyyy Aiko! 👋✨\nHow can I help you today, senpai?',
    );
    expect(run('/ai chat').reply.content).toContain('Heyyy friend!');
    expect(run('/chat').reply.content).toContain('Please provide a question');
    expect(run('!ask hello there').reply.content).toBe(aiAnswer('hello there'));
    expect(run('/chat prompt:what are you').reply.content).toContain("I'm Ririko");
  });

  it('card claim takes the active drop, or answers with the ephemeral bot error', () => {
    const none = run('/card action:claim');
    expect(none.reply).toMatchObject({
      content: '❌ There is no active card drop in this channel or server right now!',
      ephemeral: true,
    });
    const dropped = dropCard(INITIAL_STATE, '!').state;
    const claim = run('!tcg claim', dropped);
    const embed = claim.reply.embeds[0]!;
    expect(embed.title).toBe('🎉 Card Claimed: Ririko!');
    expect(embed.color).toBe(0xff69b4);
    expect(embed.description).toContain('Congratulations <@You>!');
    expect(embed.description).toContain('• **Level**: `1 / 50`');
    expect(claim.state.drop).toBeNull();
    expect(run('/card').reply.embeds[0]?.title).toBe('Command Inspector: /card');
  });

  it('other commands describe themselves from the catalog, like the help inspector', () => {
    const { reply } = run('!avatar');
    expect(reply.content).toContain('`/get-avatar`');
    const embed = reply.embeds[0]!;
    expect(embed.title).toBe('Command Inspector: /get-avatar');
    expect(embed.description).toBe('Shows an avatar.');
    expect(embed.fields.map((f) => f.name)).toEqual([
      'Syntax',
      'Usage',
      'Category',
      'Aliases',
      'Cooldown',
      'Required User Permissions',
      'Arguments',
      'Examples',
    ]);
    expect(embed.fields[0]?.value).toBe(
      '• **Slash**: `/get-avatar [user]`\n• **Prefix**: `!get-avatar [user]`',
    );
    expect(embed.fields[3]?.value).toBe('`!avatar`');
    expect(embed.fields[4]?.value).toBe('3 seconds');
    expect(embed.footer).toBe('Ririko AI 2.0 • Category: General • Prefix: !');
    expect(reply.rows[0]).toEqual({
      type: 'buttons',
      buttons: [
        {
          label: 'Help Center',
          emoji: '🏠',
          style: 'primary',
          action: { type: 'send', input: '/help' },
        },
        { label: 'General List', emoji: '✨', style: 'secondary' },
      ],
    });
    const bare = inspectCommand(findCommand('ping', catalog)!, catalog).embeds[0]!;
    expect(bare.fields.find((f) => f.name === 'Aliases')?.value).toBe('*None*');
    expect(bare.fields.some((f) => f.name === 'Arguments')).toBe(false);
  });
});

describe('greeting, hints and drops', () => {
  it('greets with four buttons that send commands or drop a card', () => {
    const greeting = greetingReply();
    expect(greeting.content).toBe("Hello! I'm Ririko 👋 What would you like to do today?");
    const row = greeting.rows[0];
    if (row?.type !== 'buttons') throw new Error('buttons expected');
    expect(row.buttons.map((b) => [b.label, b.action])).toEqual([
      ['Play music', { type: 'send', input: '/play lofi hip hop radio' }],
      ['Ask me anything', { type: 'send', input: '/ai' }],
      ['Drop a card', { type: 'drop' }],
      ['Show commands', { type: 'send', input: '/help' }],
    ]);
  });

  it('hints with the catalog prefix', () => {
    expect(textHint('?').content).toContain('`?ping`');
  });

  it('drops the demo cards in turn, with the bot embed', () => {
    const first = dropCard(INITIAL_STATE, '!');
    const embed = first.reply.embeds[0]!;
    expect(embed.title).toBe('🃏 A card dropped: Ririko!');
    expect(embed.color).toBe(0xff69b4);
    expect(embed.description).toContain('`/card action:claim` or `!card claim`');
    expect(embed.description).toContain('Expires <t:in 5 minutes>.');
    expect(embed.footer).toBe('Image source: Ririko AI');
    expect(DEMO_CARDS.map((card) => card.art)).toEqual(['sr', 'ur', 'r']);
    expect(embed.image).toEqual({ type: 'card', card: DEMO_CARDS[0] });
    expect(first.state).toMatchObject({ drop: DEMO_CARDS[0], drops: 1 });
    const second = dropCard(first.state, '!');
    expect(second.state.drop).toEqual(DEMO_CARDS[1]);
    const wrapped = dropCard({ ...INITIAL_STATE, drops: DEMO_CARDS.length }, '!');
    expect(wrapped.state.drop).toEqual(DEMO_CARDS[0]);
  });
});

describe('helpers copied from the bot', () => {
  it('formats durations and progress bars like the music commands', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(progressBar(0, 0, 5)).toBe('🔘▬▬▬▬');
    expect(progressBar(50, 100, 10)).toBe('▬▬▬▬🔘▬▬▬▬▬');
  });

  it('computes the daily reward from the default economy settings', () => {
    expect(dailyReward(1)).toEqual({ credits: 250, bonusPercent: 0 });
    expect(dailyReward(2)).toEqual({ credits: 263, bonusPercent: 5 });
    expect(dailyReward(100)).toEqual({ credits: 625, bonusPercent: 150 });
  });

  it('makes a stable demo track from the query', () => {
    const track = demoTrack('lofi beats', 'you');
    expect(track).toEqual(demoTrack('lofi beats', 'you'));
    expect(track.title).toBe('Lofi Beats');
    expect(track.seconds).toBeGreaterThanOrEqual(150);
    expect(track.seconds).toBeLessThan(270);
    expect(demoTrack('https://example.com/x', 'you').title).toBe('Your linked track');
  });

  it('answers chat in topics, with a friendly default', () => {
    expect(aiAnswer('tell me about cards')).toContain('/card action:claim');
    expect(aiAnswer('hi')).toContain('Hi there');
    expect(aiAnswer('what is the meaning of life')).toContain('only a demo');
  });
});
