/**
 * Canned replies for the landing page demo. Pure functions: they read the generated command
 * catalog, the channel state and the text, and return what Ririko "says" plus the next state.
 * Nothing is sent anywhere.
 *
 * Showcase replies copy the real bot's wording, colours and layout:
 * - `/ping`: `createPingCommand` in `apps/bot/src/command-set.ts`
 * - `/help`: `HelpGenerator` in `packages/discord/src/help/generator.ts` (home and inspector)
 * - `/daily`: `apps/bot/src/commands/economy/commands.ts`, rewards from `@ririko/core` defaults
 * - `/play`, `/queue`, `/nowplaying`: `apps/bot/src/commands/music/commands.ts`; the player message:
 *   `buildNowPlayingEmbed` and `buildControllerButtonRows` in `controllers/music-embed.controller.ts`
 * - `/ai`, `/chat`: `apps/bot/src/commands/ai/commands.ts` (the friendly `/ai` greeting is what the
 *   AI model answers to an empty prompt)
 * - `/balance`, `/leaderboard`: `apps/bot/src/commands/economy/commands.ts`
 * - `/warn`: `apps/bot/src/commands/moderation/commands.ts`, default policy from `@ririko/core`
 * - card drop and claim: `apps/bot/src/listeners/card-drop.ts`, `commands/tcg/card.command.ts`
 */

import type { AuthorId, DemoCard, DemoEmbed, DemoReply, DemoState, DemoTrack } from './types';

export interface DemoChoice {
  name: string;
  value: string;
}

export interface DemoOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: DemoChoice[];
}

export interface DemoCommand {
  name: string;
  category?: string;
  description: string;
  aliases: string[];
  usage: string | null;
  examples?: string[];
  options: DemoOption[];
  permissions?: string[];
  cooldownSeconds?: number;
  slash?: boolean;
  prefix?: boolean;
}

export interface DemoCategory {
  id: string;
  label: string;
  emoji?: string;
  description: string;
}

export interface DemoCatalog {
  prefix: string;
  categories?: DemoCategory[];
  commands: DemoCommand[];
}

export interface ParsedInput {
  /** `/` or the catalog prefix. */
  trigger: string;
  /** Lower-case command word, possibly empty. */
  word: string;
  args: string;
}

/** Splits `/play lofi` or `!avatar` into trigger, command word and arguments; null if neither. */
export function parseInput(input: string, prefix: string): ParsedInput | null {
  const text = input.trim();
  let trigger = '';
  if (text.startsWith('/')) trigger = '/';
  else if (prefix !== '' && text.startsWith(prefix)) trigger = prefix;
  if (trigger === '') return null;
  const rest = text.slice(trigger.length).trimStart();
  const space = rest.search(/\s/);
  const word = (space === -1 ? rest : rest.slice(0, space)).toLowerCase();
  const args = space === -1 ? '' : rest.slice(space).trim();
  return { trigger, word, args };
}

/**
 * Reads slash-style `name:value` options (`action:claim prompt:hi there`). Text before the
 * first option, or arguments without any option, come back as `rest`.
 */
export function parseOptions(args: string): { rest: string; named: Record<string, string> } {
  const named: Record<string, string> = {};
  const pattern = /(?:^|\s)([a-z_]+):/gi;
  // Array.from, not a spread: the site build compiles spreads of iterators loosely (as concat).
  const marks = Array.from(args.matchAll(pattern));
  if (marks.length === 0) return { rest: args.trim(), named };
  const first = marks[0];
  const rest = args.slice(0, first?.index ?? 0).trim();
  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = marks[index + 1]?.index ?? args.length;
    named[(mark[1] ?? '').toLowerCase()] = args.slice(start, end).trim();
  });
  return { rest, named };
}

export function findCommand(word: string, catalog: DemoCatalog): DemoCommand | undefined {
  return catalog.commands.find(
    (command) => command.name === word || command.aliases.includes(word),
  );
}

/**
 * Commands whose name or alias starts with the typed word first, then those that contain it.
 * For `/`, only commands that have a slash form.
 */
export function suggestCommands(input: string, catalog: DemoCatalog, limit = 5): DemoCommand[] {
  const parsed = parseInput(input, catalog.prefix);
  if (!parsed || parsed.args !== '' || /\s$/.test(input)) return [];
  const pool =
    parsed.trigger === '/'
      ? catalog.commands.filter((command) => command.slash !== false)
      : catalog.commands;
  const names = (command: DemoCommand): string[] => [command.name, ...command.aliases];
  const starts = pool.filter((command) =>
    names(command).some((name) => name.startsWith(parsed.word)),
  );
  const contains = pool.filter(
    (command) =>
      !starts.includes(command) && names(command).some((name) => name.includes(parsed.word)),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** `<query> [page]`: required options in angle brackets, optional ones in square brackets. */
export function optionSignature(command: DemoCommand): string {
  return command.options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ');
}

export const DISPLAY_NAMES: Record<AuthorId, string> = {
  ririko: 'Ririko',
  aiko: 'Aiko',
  you: 'You',
};

/** The account names the bot prints (`target.username`); made up, like the display names. */
const USERNAMES: Record<AuthorId, string> = {
  ririko: 'ririko.ai',
  aiko: 'aiko',
  you: 'guest',
};

/** What an empty `/ai` calls a person: members by name, the visitor as a friend. */
function friendlyName(author: AuthorId): string {
  return author === 'you' ? 'friend' : DISPLAY_NAMES[author];
}

export const BOT_VERSION = '2.0.1';

const COLORS = {
  primary: 0x5865f2,
  card: 0xff69b4,
  warn: 0xf1c40f,
};

function reply(parts: Partial<DemoReply>): DemoReply {
  return { embeds: [], rows: [], ...parts };
}

/** The greeting with its four buttons. */
export function greetingReply(): DemoReply {
  return reply({
    content: "Hello! I'm Ririko 👋 What would you like to do today?",
    rows: [
      {
        type: 'buttons',
        buttons: [
          {
            label: 'Play music',
            emoji: '🎵',
            style: 'primary',
            action: { type: 'send', input: '/play lofi hip hop radio' },
          },
          {
            label: 'Ask me anything',
            emoji: '💬',
            style: 'secondary',
            action: { type: 'send', input: '/ai' },
          },
          { label: 'Drop a card', emoji: '🎴', style: 'secondary', action: { type: 'drop' } },
          {
            label: 'Show commands',
            emoji: '📜',
            style: 'secondary',
            action: { type: 'send', input: '/help' },
          },
        ],
      },
    ],
  });
}

/** What Ririko tells a visitor who typed text without a command. */
export function textHint(prefix: string): DemoReply {
  return reply({
    content: `Psst! In this demo I answer commands. Start with \`/\` or \`${prefix}\`, for example \`/help\`, \`/play\` or \`${prefix}ping\`. You can also say hi with \`@Ririko\`.`,
    ephemeral: true,
  });
}

/**
 * Cards the demo drops, in turn. The pictures were drawn by the bot's own card renderer
 * (`CardSynthesizer`) from the Ririko picture; the real bot draws cards from its catalog.
 */
export const DEMO_CARDS: DemoCard[] = [
  {
    name: 'Ririko',
    art: 'sr',
    rarity: 'Super Rare (SR)',
    foil: 'Gold Shimmer',
    element: 'ICE',
    serial: '#0042/1000',
    maxLevel: 50,
    hp: 1240,
    atk: 186,
    def: 142,
    spd: 118,
  },
  {
    name: 'Ririko',
    art: 'ur',
    rarity: 'Ultra Rare (UR)',
    foil: 'Prismatic Hologram',
    element: 'LIGHTNING',
    serial: '#0007/1000',
    maxLevel: 60,
    hp: 1630,
    atk: 245,
    def: 171,
    spd: 152,
  },
  {
    name: 'Ririko',
    art: 'r',
    rarity: 'Rare',
    foil: 'Silver Sheen',
    element: 'FIRE',
    serial: '#0315/1000',
    maxLevel: 40,
    hp: 980,
    atk: 151,
    def: 104,
    spd: 97,
  },
];

const IMAGE_SOURCE = 'Image source: Ririko AI';

/** A spontaneous card drop, as the bot posts it when a channel is busy. */
export function dropCard(state: DemoState, prefix: string): { reply: DemoReply; state: DemoState } {
  const card = DEMO_CARDS[state.drops % DEMO_CARDS.length] ?? DEMO_CARDS[0]!;
  const embed: DemoEmbed = {
    color: COLORS.card,
    title: `🃏 A card dropped: ${card.name}!`,
    description:
      `• **Rarity**: \`${card.rarity}\`\n` +
      `• **Element**: \`${card.element}\`\n` +
      `• **Serial**: \`${card.serial}\`\n\n` +
      `First to claim it keeps it: \`/card action:claim\` or \`${prefix}card claim\`. Expires <t:in 5 minutes>.`,
    fields: [],
    footer: IMAGE_SOURCE,
    image: { type: 'card', card },
  };
  return {
    reply: reply({ embeds: [embed] }),
    state: { ...state, drop: card, drops: state.drops + 1 },
  };
}

function claimCard(state: DemoState, author: AuthorId): { reply: DemoReply; state: DemoState } {
  const card = state.drop;
  if (!card) {
    return {
      reply: reply({
        content: '❌ There is no active card drop in this channel or server right now!',
        ephemeral: true,
      }),
      state,
    };
  }
  const embed: DemoEmbed = {
    color: COLORS.card,
    title: `🎉 Card Claimed: ${card.name}!`,
    description:
      `Congratulations <@${DISPLAY_NAMES[author]}>! You were the first to claim this card drop!\n\n` +
      `• **Rarity**: \`${card.rarity}\` (${card.foil})\n` +
      `• **Element**: \`${card.element}\`\n` +
      `• **Serial**: \`${card.serial}\`\n` +
      `• **Level**: \`1 / ${card.maxLevel}\`\n` +
      `• **Stats**: HP \`${card.hp}\` | ATK \`${card.atk}\` | DEF \`${card.def}\` | SPD \`${card.spd}\``,
    fields: [],
    footer: `${IMAGE_SOURCE} • ${card.serial}`,
    image: { type: 'card', card },
  };
  return { reply: reply({ embeds: [embed] }), state: { ...state, drop: null } };
}

/** Same as the bot's `formatDuration`. */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Same as the bot's `createProgressBar`. */
export function progressBar(current: number, total: number, length = 15): string {
  if (!total || total <= 0) return '🔘' + '▬'.repeat(length - 1);
  const percent = Math.max(0, Math.min(1, current / total));
  const progress = Math.round(length * percent);
  const empty = length - progress;
  return '▬'.repeat(Math.max(0, progress - 1)) + '🔘' + '▬'.repeat(Math.max(0, empty));
}

/** A made-up track for the query: the demo cannot search, so the title is the query itself. */
export function demoTrack(query: string, requestedBy: AuthorId): DemoTrack {
  const clean = query.replace(/^<|>$/g, '').trim();
  const title = /^https?:\/\//i.test(clean)
    ? 'Your linked track'
    : clean.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()).slice(0, 80);
  let hash = 0;
  for (const char of clean) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  return { title, artist: 'Ririko Radio', seconds: 150 + (hash % 120), requestedBy };
}

/** Every demo track links here; the demo has no real track pages. */
const TRACK_URL = 'https://ririko.ai';

/** How far into the track `/nowplaying` and `/queue` say the song is. */
const NOW_ELAPSED = 42;

/** The two button rows of the player message: `buildControllerButtonRows` in the bot. */
function playerRows(total: number): DemoReply['rows'] {
  const upcoming = total - 1;
  return [
    {
      type: 'buttons',
      buttons: [
        { label: 'Previous', emoji: '⏮️', style: 'primary', disabled: true, iconOnly: true },
        { label: 'Pause', emoji: '⏸️', style: 'primary', iconOnly: true },
        { label: 'Next', emoji: '⏭️', style: 'primary', disabled: upcoming === 0, iconOnly: true },
        { label: 'Stop', emoji: '🛑', style: 'danger', iconOnly: true },
        { label: 'Mute', emoji: '🔇', style: 'secondary', iconOnly: true },
      ],
    },
    {
      type: 'buttons',
      buttons: [
        { label: 'Loop: Off', emoji: '🔁', style: 'secondary' },
        { label: 'Shuffle', emoji: '🔀', style: 'secondary', disabled: total < 2 },
        { label: 'Lyrics', emoji: '📝', style: 'secondary' },
        {
          label: `Queue (${total})`,
          emoji: '📜',
          style: 'secondary',
          action: { type: 'send', input: '/queue' },
        },
        { label: 'Refresh', emoji: '🔄', style: 'secondary' },
      ],
    },
  ];
}

/**
 * The player message the bot keeps updated in the music channel: `buildNowPlayingEmbed` (title
 * link, slider, time boxes, Artist / Requester / Source, Settings, footer) and the button rows.
 */
export function playerMessage(state: DemoState, elapsed = 0): DemoReply {
  const track = state.queue[0];
  if (!track) return reply({ content: '⚠️ Nothing is currently playing.' });
  const total = state.queue.length;
  const embed: DemoEmbed = {
    color: COLORS.primary,
    title: `[🎵 ${track.title}](${TRACK_URL})`,
    description:
      `${progressBar(elapsed, track.seconds, 14)}\n` +
      `\`${formatDuration(elapsed)}\` / \`${formatDuration(track.seconds)}\`\n` +
      '▶️ *Now Playing*',
    fields: [
      { name: '👤 Artist', value: track.artist, inline: true },
      { name: '🎧 Requester', value: `<@${DISPLAY_NAMES[track.requestedBy]}>`, inline: true },
      { name: '🌐 Source', value: '**YOUTUBE**', inline: true },
      {
        name: '🎛️ Settings',
        value: `Volume: **80%** • Loop: **OFF** • Filters: **None** • Queue: **${total}** (Upcoming: **${total - 1}**)`,
        inline: false,
      },
    ],
    footer: 'Ririko Music 2.0 • Zero-Polling Reactive UI',
    timestamp: true,
    thumbnail: { type: 'cover', title: track.title },
  };
  return reply({ embeds: [embed], rows: playerRows(total) });
}

/**
 * `/play`, as the bot answers it: "🎵 Now Playing" for the first track (which also brings up the
 * player message, like the music channel controller), "➕ Added to Queue" with the position when a
 * track is already playing.
 */
function play(args: string, state: DemoState, author: AuthorId): CommandResult {
  const { rest, named } = parseOptions(args);
  const query = (named.query ?? rest).trim();
  if (query === '') {
    return { reply: reply({ content: '❌ Please provide a song title or URL to play.' }), state };
  }
  const track = demoTrack(query, author);
  const queue = [...state.queue, track];
  const position = queue.length - 1;
  const isNowPlaying = position === 0;
  const next = { ...state, queue };
  const embed: DemoEmbed = {
    color: COLORS.primary,
    title: isNowPlaying ? '🎵 Now Playing' : '➕ Added to Queue',
    description: `**[${track.title}](${TRACK_URL})**`,
    fields: [
      { name: 'Artist', value: track.artist, inline: true },
      { name: 'Duration', value: formatDuration(track.seconds), inline: true },
      { name: 'Position', value: isNowPlaying ? 'Now Playing' : `#${position}`, inline: true },
    ],
    thumbnail: { type: 'cover', title: track.title },
  };
  return {
    reply: reply({
      embeds: [embed],
      ...(isNowPlaying ? { followUp: playerMessage(next) } : {}),
    }),
    state: next,
  };
}

/** `/queue`: the now playing track, the upcoming ones and the totals. */
function queueList(state: DemoState): CommandResult {
  const current = state.queue[0];
  if (!current) {
    return { reply: reply({ content: '📜 The music queue is currently empty.' }), state };
  }
  const upcoming = state.queue.slice(1);
  const total = state.queue.length;
  const noun = total === 1 ? 'track' : 'tracks';
  const elapsed = Math.min(NOW_ELAPSED, current.seconds);
  const remaining =
    upcoming.reduce((sum, track) => sum + track.seconds, 0) + (current.seconds - elapsed);
  const embed: DemoEmbed = {
    color: COLORS.primary,
    title: `📜 Music Queue (${total} ${noun})`,
    description:
      `**Now Playing:**\n🎶 **[${current.title}](${TRACK_URL})** | \`${formatDuration(current.seconds)}\` ` +
      `(Requested by: <@${DISPLAY_NAMES[current.requestedBy]}>)\n\n**Upcoming Tracks:**`,
    fields: [
      upcoming.length > 0
        ? {
            name: 'Queue',
            value: upcoming
              .slice(0, 10)
              .map(
                (track, index) =>
                  `\`${index + 1}.\` **[${track.title}](${TRACK_URL})** | \`${formatDuration(track.seconds)}\` (by <@${DISPLAY_NAMES[track.requestedBy]}>)`,
              )
              .join('\n'),
            inline: false,
          }
        : { name: 'Upcoming', value: '*No upcoming tracks in queue.*', inline: false },
    ],
    footer: `Total: ${total} ${noun} | Total Duration: ${formatDuration(remaining)} | Loop: OFF`,
  };
  return { reply: reply({ embeds: [embed] }), state };
}

function nowPlaying(state: DemoState): CommandResult {
  const track = state.queue[0];
  if (!track) return { reply: reply({ content: '⚠️ Nothing is currently playing.' }), state };
  const elapsed = Math.min(NOW_ELAPSED, track.seconds);
  const embed: DemoEmbed = {
    color: COLORS.primary,
    title: '🎵 Now Playing',
    description: `**[${track.title}](${TRACK_URL})**\n\n\`${formatDuration(elapsed)}\` ${progressBar(elapsed, track.seconds, 16)} \`${formatDuration(track.seconds)}\``,
    fields: [
      { name: 'Artist', value: track.artist, inline: true },
      { name: 'Volume', value: '80%', inline: true },
      { name: 'Loop Mode', value: 'OFF', inline: true },
      { name: 'Requested By', value: DISPLAY_NAMES[track.requestedBy], inline: true },
      { name: 'Source', value: 'YOUTUBE', inline: true },
      { name: 'Active Filters', value: 'None', inline: true },
    ],
    thumbnail: { type: 'cover', title: track.title },
  };
  return { reply: reply({ embeds: [embed] }), state };
}

/** Streak and wallet the demo members start with. */
const DAILY_START: Record<AuthorId, { streak: number; wallet: number }> = {
  ririko: { streak: 1, wallet: 0 },
  aiko: { streak: 12, wallet: 4000 },
  you: { streak: 1, wallet: 0 },
};

/** The default economy settings: 250 credits, +5% per streak day, at most +150%. */
export function dailyReward(streak: number): { credits: number; bonusPercent: number } {
  const bonusPercent = streak <= 1 ? 0 : Math.min(150, (Math.floor(streak) - 1) * 5);
  return { credits: Math.round((250 * (100 + bonusPercent)) / 100), bonusPercent };
}

function daily(state: DemoState, author: AuthorId, now: number): CommandResult {
  if (state.dailyClaimed.includes(author)) {
    const day = 86_400_000;
    const remaining = Math.ceil((day - (((now % day) + day) % day)) / 1000);
    return {
      reply: reply({
        content: `⏳ **Daily Reward Cooldown**\nDaily reward already claimed today. Resets in ${remaining}s.`,
      }),
      state,
    };
  }
  const start = DAILY_START[author];
  const { credits, bonusPercent } = dailyReward(start.streak);
  return {
    reply: reply({
      content: `🎉 **Daily Reward Claimed!**\n• Awarded: **+${credits} credits**\n• Consecutive Streak: **${start.streak} days** (+${bonusPercent}% bonus)\n• Wallet Balance: **${(start.wallet + credits).toLocaleString('en-US')} credits**`,
    }),
    state: { ...state, dailyClaimed: [...state.dailyClaimed, author] },
  };
}

function ping(): DemoReply {
  return reply({
    content: `🏓 **Pong!**\n• Gateway Latency: \`42ms\`\n• Execution Latency: \`3ms\`\n• Bot Version: \`v${BOT_VERSION}\``,
  });
}

/** A canned answer in Ririko's friendly voice. A real server asks the AI model it set up. */
export function aiAnswer(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/\b(music|song|songs|play|playlist)\b/.test(text)) {
    return 'I love music! 🎵 I can play songs from YouTube, Spotify links and SoundCloud. Try `/play` with a song name and I will start the party.';
  }
  if (/\b(card|cards|tcg|waifu|collect)\b/.test(text)) {
    return 'Cards drop while people chat! 🎴 Be the first to claim one with `/card action:claim`, then level it up, craft gear and fight dungeon bosses.';
  }
  if (/\b(who|what) are you\b|\babout you\b|\bwhat can you do\b/.test(text)) {
    return "I'm Ririko, an open source bot for your server ✨ I play music, chat with AI, run a card game and an economy, and help moderators. Try `/help` to see everything.";
  }
  if (/\b(hi|hello|hey|yo|konnichiwa|hiya)\b/.test(text)) {
    return 'Hi there! 👋 It is nice to meet you. Ask me anything, or try `/help` to see what I can do.';
  }
  return 'Ooh, good question! 💭 On a real server I answer with the AI model the server picked (Gemini, OpenAI or Ollama). This page is only a demo, so my answers here are canned. Try `/help` to see what I can do!';
}

function ai(command: string, args: string, author: AuthorId): DemoReply {
  const { rest, named } = parseOptions(args);
  let prompt = (named.prompt ?? rest).trim();
  if (command === 'ai' && /^chat\b/i.test(prompt)) prompt = prompt.slice(4).trim();
  if (prompt === '') {
    return reply({
      content:
        command === 'chat'
          ? '👋 Please provide a question or topic to chat about! (e.g. `/chat prompt: What is an anime?`)'
          : `Heyyy ${friendlyName(author)}! 👋✨\nHow can I help you today, senpai?`,
    });
  }
  return reply({ content: aiAnswer(prompt) });
}

/** Account levels of the demo members; they set the bank capacity (10,000 + 2,500 per level). */
const LEVELS: Record<AuthorId, number> = { ririko: 1, aiko: 31, you: 3 };

/** Wallet credits: the starting wallet plus today's daily reward, once claimed. */
export function walletOf(author: AuthorId, state: DemoState): number {
  const start = DAILY_START[author];
  return (
    start.wallet + (state.dailyClaimed.includes(author) ? dailyReward(start.streak).credits : 0)
  );
}

function balance(state: DemoState, author: AuthorId): DemoReply {
  const wallet = walletOf(author, state).toLocaleString('en-US');
  const capacity = (10_000 + LEVELS[author] * 2_500).toLocaleString('en-US');
  return reply({
    content: `🪙 **${USERNAMES[author]}'s Financial Balance**\n• **Wallet**: \`${wallet} credits\`\n• **Bank**: \`0 / ${capacity} credits\`\n• **Net Worth**: \`${wallet} credits\``,
  });
}

/** The made-up ranking `/leaderboard` shows: members by XP. */
const RANKING: Array<{ name: string; level: number; xp: number }> = [
  { name: 'Aiko', level: 31, xp: 96_310 },
  { name: 'Hana', level: 20, xp: 37_942 },
  { name: 'Kenji', level: 12, xp: 11_806 },
  { name: 'You', level: 3, xp: 1_070 },
];

function leaderboard(args: string): DemoReply {
  const { rest, named } = parseOptions(args);
  const scope = (named.scope ?? rest.split(/\s+/)[0] ?? '').toLowerCase();
  const lines = RANKING.map(
    (entry, index) =>
      `\`#${String(index + 1).padStart(2, ' ')}\` <@${entry.name}> — **LVL ${entry.level}** (${entry.xp.toLocaleString('en-US')} XP)`,
  );
  const title = scope === 'global' ? 'Global Leveling Leaderboard' : `${SERVER_NAME} Leaderboard`;
  return reply({ content: `🏆 **${title}** (Page 1/1)\n\n${lines.join('\n')}` });
}

/** The server the demo window shows. */
export const SERVER_NAME = 'Ririko Café';

/** `warn_threshold` steps of the default escalation policy in `@ririko/core`. */
const ESCALATION: Array<{ threshold: number; action: string; seconds?: number }> = [
  { threshold: 1, action: 'WARN' },
  { threshold: 2, action: 'WARN' },
  { threshold: 3, action: 'TIMEOUT', seconds: 600 },
  { threshold: 4, action: 'TIMEOUT', seconds: 3600 },
  { threshold: 5, action: 'TIMEOUT', seconds: 86_400 },
  { threshold: 6, action: 'BAN' },
];

/** Same as the bot's `formatDurationSeconds`. */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86_400)} days`;
}

/** Keeps a typed name or reason short and free of mention brackets. */
function cleanText(text: string, max: number): string {
  return text.replace(/[<>]/g, '').replace(/^@+/, '').trim().slice(0, max);
}

/** `/warn`: a formal warning, the cumulative score and the automatic step it reaches. */
function warn(args: string, state: DemoState, author: AuthorId): CommandResult {
  const { rest, named } = parseOptions(args);
  const [first = '', ...others] = rest.split(/\s+/);
  const target = cleanText((named.user ?? first).split(/\s+/)[0] ?? '', 32) || 'Kenji';
  const reason = cleanText(named.reason ?? others.join(' '), 200) || 'Spamming in the chat';
  const parsedSeverity = Number.parseInt(named.severity ?? '', 10);
  const severity = Number.isFinite(parsedSeverity) ? Math.min(5, Math.max(1, parsedSeverity)) : 1;
  const dm = !/^(false|no|0)$/i.test(named.send_dm ?? 'true');
  const warns = state.warns + 1;
  const score = state.warnScore + severity;
  const step = [...ESCALATION].reverse().find((candidate) => score >= candidate.threshold);
  const fields: DemoEmbed['fields'] = [
    {
      name: 'Target Member',
      value: `<@${target}> (${target.toLowerCase().replace(/\s+/g, '')})`,
      inline: true,
    },
    { name: 'Moderator', value: `<@${DISPLAY_NAMES[author]}>`, inline: true },
    { name: 'Severity', value: `${severity}`, inline: true },
    { name: 'Reason', value: reason, inline: false },
    {
      name: 'Active Warnings Summary',
      value: `• Active Warnings: **${warns}**\n• Cumulative Score: **${score} pts**`,
      inline: true,
    },
    { name: 'DM Notification', value: dm ? '✅ Delivered' : '⚠️ Blocked / Failed', inline: true },
  ];
  if (step) {
    fields.push({
      name: '🚨 Automatic Escalation Triggered!',
      value: `Infraction threshold reached step: **${step.action}**${
        step.seconds ? ` (${formatSeconds(step.seconds)})` : ''
      }`,
      inline: false,
    });
  }
  return {
    reply: reply({
      embeds: [
        {
          color: COLORS.warn,
          title: `⚠️ Warning Issued — Case #${warns}`,
          fields,
          timestamp: true,
        },
      ],
    }),
    state: { ...state, warns, warnScore: score },
  };
}

function categoryOf(command: DemoCommand, catalog: DemoCatalog): DemoCategory | undefined {
  return catalog.categories?.find((category) => category.id === command.category);
}

/** The Help Center home: one inline field per category, the category menu, the footer. */
export function helpHome(catalog: DemoCatalog): DemoReply {
  const { prefix } = catalog;
  const categories = (catalog.categories ?? [])
    .map((category) => ({
      category,
      count: catalog.commands.filter((command) => command.category === category.id).length,
    }))
    .filter(({ count }) => count > 0);
  const embed: DemoEmbed = {
    color: COLORS.primary,
    title: '✨ Ririko AI 2.0 — Interactive Help Center',
    description:
      'Welcome to **Ririko AI 2.0**! Use the category menu below to browse available commands, or type `/help command:<name>` ' +
      `(or \`${prefix}help <name>\`) to inspect a command directly.\n\n` +
      'All commands feature dual-dispatch parity — use them seamlessly as `/slash` commands or with prefix ' +
      `\`${prefix}\`.`,
    fields: categories.map(({ category, count }) => ({
      name: `${category.emoji ? `${category.emoji} ` : ''}${category.label} (${count})`,
      value: category.description,
      inline: true,
    })),
    footer: `Prefix: ${prefix} • Total Commands: ${catalog.commands.length} • Ririko AI 2.0.0`,
  };
  return reply({
    embeds: [embed],
    rows: [{ type: 'select', placeholder: 'Select a category to browse commands...' }],
  });
}

/** The Command Inspector view of `/help <command>`, built from the catalog. */
export function inspectCommand(command: DemoCommand, catalog: DemoCatalog): DemoReply {
  const { prefix } = catalog;
  const signature = optionSignature(command);
  const sig = signature === '' ? '' : ` ${signature}`;
  const syntax: string[] = [];
  if (command.slash !== false) syntax.push(`• **Slash**: \`/${command.name}${sig}\``);
  if (command.prefix !== false) syntax.push(`• **Prefix**: \`${prefix}${command.name}${sig}\``);
  const category = categoryOf(command, catalog);
  const label = category?.label ?? 'General';
  const emoji = category?.emoji ?? '✨';

  const fields: DemoEmbed['fields'] = [
    { name: 'Syntax', value: syntax.join('\n') || 'Disabled', inline: false },
  ];
  if (command.usage) fields.push({ name: 'Usage', value: `\`${command.usage}\``, inline: false });
  fields.push(
    { name: 'Category', value: `${emoji} ${label}`, inline: true },
    {
      name: 'Aliases',
      value:
        command.aliases.length > 0
          ? command.aliases.map((alias) => `\`${prefix}${alias}\``).join(', ')
          : '*None*',
      inline: true,
    },
    {
      name: 'Cooldown',
      value: command.cooldownSeconds ? `${command.cooldownSeconds} seconds` : 'None',
      inline: true,
    },
    {
      name: 'Required User Permissions',
      value:
        command.permissions && command.permissions.length > 0
          ? command.permissions.join(', ')
          : 'Everyone',
      inline: false,
    },
  );
  if (command.options.length > 0) {
    fields.push({
      name: 'Arguments',
      value: command.options
        .map(
          (o) =>
            `• \`${o.name}\` (*${o.type.toLowerCase()}*, ${o.required ? 'required' : 'optional'}): ${o.description}`,
        )
        .join('\n'),
      inline: false,
    });
  }
  if (command.examples && command.examples.length > 0) {
    fields.push({
      name: 'Examples',
      value: command.examples.map((example) => `\`${example}\``).join('\n'),
      inline: false,
    });
  }
  return reply({
    content: `*This page is a demo, so here is what \`/${command.name}\` does instead.*`,
    embeds: [
      {
        color: COLORS.primary,
        title: `Command Inspector: /${command.name}`,
        description: command.description,
        fields,
        footer: `Ririko AI 2.0 • Category: ${label} • Prefix: ${prefix}`,
      },
    ],
    rows: [
      {
        type: 'buttons',
        buttons: [
          {
            label: 'Help Center',
            emoji: '🏠',
            style: 'primary',
            action: { type: 'send', input: '/help' },
          },
          { label: `${label} List`, emoji, style: 'secondary' },
        ],
      },
    ],
  });
}

interface CommandResult {
  reply: DemoReply;
  state: DemoState;
}

export interface DemoContext {
  author: AuthorId;
  /** Epoch milliseconds; only the daily cooldown reads it. */
  now: number;
}

export type Outcome =
  | { kind: 'empty' }
  /** Plain chat. `reply` is Ririko's answer to a mention, or a hint for the visitor. */
  | { kind: 'text'; reply: DemoReply | null; mention: boolean }
  | { kind: 'command'; trigger: string; name: string; reply: DemoReply; state: DemoState }
  | { kind: 'unknown'; trigger: string; word: string; reply: DemoReply };

const MENTION = /^@?ririko\b[\s,:!]*/i;

/** What Ririko does with a message: the reply, and the channel state after it. */
export function replyTo(
  input: string,
  catalog: DemoCatalog,
  state: DemoState,
  context: DemoContext,
): Outcome {
  const text = input.trim();
  if (text === '') return { kind: 'empty' };
  const { prefix } = catalog;
  const parsed = parseInput(text, prefix);
  if (!parsed) {
    if (MENTION.test(text) || /@ririko\b/i.test(text)) {
      const prompt = text.replace(MENTION, '').trim();
      return { kind: 'text', reply: reply({ content: aiAnswer(prompt) }), mention: true };
    }
    return {
      kind: 'text',
      reply: context.author === 'you' ? textHint(prefix) : null,
      mention: false,
    };
  }

  const command = findCommand(parsed.word, catalog);
  if (!command) {
    const similar = suggestCommands(`${parsed.trigger}${parsed.word}`, catalog, 3);
    const hint =
      similar.length > 0
        ? `Did you mean ${similar.map((c) => `\`${parsed.trigger}${c.name}\``).join(', ')}?`
        : `Try \`${parsed.trigger}help\` to see them all.`;
    return {
      kind: 'unknown',
      trigger: parsed.trigger,
      word: parsed.word,
      reply: reply({
        content: `I do not know \`${parsed.trigger}${parsed.word}\` yet. ${hint}`,
        ephemeral: true,
      }),
    };
  }

  const result = runCommand(command, parsed.args, catalog, state, context);
  return { kind: 'command', trigger: parsed.trigger, name: command.name, ...result };
}

function runCommand(
  command: DemoCommand,
  args: string,
  catalog: DemoCatalog,
  state: DemoState,
  { author, now }: DemoContext,
): CommandResult {
  switch (command.name) {
    case 'ping':
      return { reply: ping(), state };
    case 'help': {
      const { rest, named } = parseOptions(args);
      const target = (named.command ?? rest).replace(/^[/!]/, '').trim().toLowerCase();
      const found = target === '' ? undefined : findCommand(target, catalog);
      return { reply: found ? inspectCommand(found, catalog) : helpHome(catalog), state };
    }
    case 'play':
      return play(args, state, author);
    case 'queue':
      return queueList(state);
    case 'nowplaying':
      return nowPlaying(state);
    case 'daily':
      return daily(state, author, now);
    case 'balance':
      return { reply: balance(state, author), state };
    case 'leaderboard':
      return { reply: leaderboard(args), state };
    case 'warn':
      return warn(args, state, author);
    case 'ai':
    case 'chat':
      return { reply: ai(command.name, args, author), state };
    case 'card': {
      const { rest, named } = parseOptions(args);
      const action = (named.action ?? rest.split(/\s+/)[0] ?? '').toLowerCase();
      if (action === 'claim') return claimCard(state, author);
      return { reply: inspectCommand(command, catalog), state };
    }
    default:
      return { reply: inspectCommand(command, catalog), state };
  }
}
