/**
 * The message model of the landing page demo. Everything here is plain data, so the reply and
 * script logic stays pure and testable; the React components only draw it.
 */

/** The three people in the demo channel: the bot, a scripted member and the visitor. */
export type AuthorId = 'ririko' | 'aiko' | 'you';

export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';

/** What a clickable button in a message does: send a command, or make a card drop. */
export type ButtonAction = { type: 'send'; input: string } | { type: 'drop' };

export interface DemoButton {
  label: string;
  emoji?: string;
  style: ButtonStyle;
  /** Buttons without an action are drawn but do nothing. */
  action?: ButtonAction;
  /** Drawn dimmed, like a disabled control. */
  disabled?: boolean;
  /** Show only the emoji; the label stays for screen readers. */
  iconOnly?: boolean;
}

export type DemoRow =
  { type: 'buttons'; buttons: DemoButton[] } | { type: 'select'; placeholder: string };

export interface DemoField {
  name: string;
  value: string;
  inline: boolean;
}

/** Which pre-rendered card picture a demo card uses (`website/static/img/demo/card-<art>.webp`). */
export type CardArt = 'sr' | 'ur' | 'r';

/** A Waifu TCG card as the demo shows it: the bot's own card renderer drew the pictures. */
export interface DemoCard {
  name: string;
  art: CardArt;
  /** Rarity tier name, as in `RARITY_TIERS` (for example `Super Rare (SR)`). */
  rarity: string;
  foil: string;
  element: string;
  serial: string;
  maxLevel: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface DemoTrack {
  title: string;
  artist: string;
  seconds: number;
  requestedBy: AuthorId;
}

/** Pictures inside embeds, drawn by the page instead of loaded from outside services. */
export type DemoMedia = { type: 'card'; card: DemoCard } | { type: 'cover'; title: string };

export interface DemoEmbed {
  /** Colour of the left bar, as a number like the bot's `setColor(0x5865f2)`. */
  color: number;
  title?: string;
  description?: string;
  fields: DemoField[];
  footer?: string;
  /** Show "Today at HH:MM" after the footer, like `setTimestamp()`. */
  timestamp?: boolean;
  thumbnail?: DemoMedia;
  image?: DemoMedia;
}

/** One message body: text, embeds and component rows, like a Discord message payload. */
export interface DemoReply {
  content?: string;
  embeds: DemoEmbed[];
  rows: DemoRow[];
  /** Ephemeral replies carry "Only you can see this". */
  ephemeral?: boolean;
  /** A second message the bot posts right after this one (the `/play` answer, then the player). */
  followUp?: DemoReply;
}

/** The bits of channel state that change what Ririko answers. */
export interface DemoState {
  queue: DemoTrack[];
  /** The card waiting to be claimed, if any. */
  drop: DemoCard | null;
  /** How many cards dropped so far; picks the next demo card. */
  drops: number;
  /** Who already claimed today's daily reward. */
  dailyClaimed: AuthorId[];
  /** Warnings issued so far, and their summed severity (the cumulative score). */
  warns: number;
  warnScore: number;
}

export const INITIAL_STATE: DemoState = {
  queue: [],
  drop: null,
  drops: 0,
  dailyClaimed: [],
  warns: 0,
  warnScore: 0,
};

/** A message in the chat log. */
export interface DemoMessage {
  id: string;
  author: AuthorId;
  /** Epoch milliseconds, set when the message is shown. */
  at: number;
  body: DemoReply;
  /** A slash command reply shows "<user> used /<command>" above it. */
  interaction?: { user: AuthorId; command: string };
  /** A prefix command reply quotes the message it answers. */
  replyTo?: { user: AuthorId; text: string };
  /** "Ririko is thinking..." until the reply arrives. */
  pending?: boolean;
  /** Always draw the avatar, name and time, even when the message follows one by the same author. */
  header?: boolean;
}
