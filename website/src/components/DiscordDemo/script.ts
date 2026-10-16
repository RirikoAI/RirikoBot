/**
 * Timing for the landing page demo, as pure data: who types, when each message appears and how
 * the channel state changes. The component only runs the timers; these functions decide the plan,
 * so the greeting, the scripted show and every visitor command can be unit-tested.
 */

import {
  dropCard,
  greetingReply,
  replyTo,
  type DemoCatalog,
  type DemoContext,
  type Outcome,
} from './reply';
import type { AuthorId, DemoMessage, DemoReply, DemoState } from './types';

/** A message to add, keyed so a later `resolve` can fill in a "thinking" placeholder. */
export type PlannedMessage = Omit<DemoMessage, 'id' | 'at'> & { key: string };

export type DemoEvent =
  /** Show "<author> is typing..." below the composer, or hide it with `null`. */
  | { type: 'typing'; author: AuthorId | null }
  | { type: 'post'; message: PlannedMessage; state?: DemoState }
  /** Replace the placeholder posted under `key` with the finished reply. */
  | { type: 'resolve'; key: string; body: DemoReply; state?: DemoState };

export interface TimedEvent {
  /** Milliseconds after the plan starts. */
  at: number;
  event: DemoEvent;
}

export interface Plan {
  events: TimedEvent[];
  /** The channel state once every event has run. */
  state: DemoState;
}

export interface PlanOptions {
  /** `prefers-reduced-motion`: no typing delays at all. */
  reduced: boolean;
  /** Makes the message keys of this plan unique. */
  seq: number;
  now: number;
}

/** Short gap between a message and the start of Ririko's answer. */
export const REACTION_MS = 350;

/** How long after a reply its follow-up message (the music player) appears. */
export const FOLLOW_UP_MS = 800;

/** A reply without its follow-up, and the follow-up on its own. */
function splitReply(body: DemoReply): { main: DemoReply; followUp: DemoReply | null } {
  const { followUp, ...main } = body;
  return { main, followUp: followUp ?? null };
}

/** The event that posts a follow-up message; it always shows the bot's avatar and name. */
function followUpPost(body: DemoReply, key: string, at: number): TimedEvent {
  return {
    at,
    event: {
      type: 'post',
      message: { key: `${key}-out2`, author: 'ririko', body, header: true },
    },
  };
}

/** How long someone "types" a text: longer texts take longer, within limits. */
export function typingMs(text: string, reduced: boolean): number {
  if (reduced) return 0;
  return Math.min(1800, Math.max(700, 450 + text.length * 14));
}

/** Rough length of what a reply shows, to scale the typing time. */
export function replyLength(body: DemoReply): number {
  const embeds = body.embeds.reduce(
    (sum, embed) =>
      sum +
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      embed.fields.reduce((total, field) => total + field.name.length + field.value.length, 0),
    0,
  );
  return (body.content?.length ?? 0) + Math.round(embeds / 3);
}

/** A typed message; `@Ririko` shows as a mention, like the client renders it. */
export function textBody(text: string): DemoReply {
  return { content: text.replace(/(^|\s)@ririko\b/gi, '$1<@Ririko>'), embeds: [], rows: [] };
}

/** "Ririko is typing...", then the greeting with its buttons. */
export function planGreeting(reduced: boolean): TimedEvent[] {
  const body = greetingReply();
  const start = reduced ? 0 : 500;
  const typed = start + typingMs(body.content ?? '', reduced);
  return [
    { at: start, event: { type: 'typing', author: 'ririko' } },
    { at: typed, event: { type: 'typing', author: null } },
    {
      at: typed,
      event: { type: 'post', message: { key: 'greeting', author: 'ririko', body } },
    },
  ];
}

/**
 * What happens when `author` sends `input`: the message itself (prefix commands and chat), a
 * "thinking" placeholder for slash commands, the typing indicator, then Ririko's reply.
 */
export function planCommand(
  input: string,
  author: AuthorId,
  catalog: DemoCatalog,
  state: DemoState,
  options: PlanOptions,
): Plan & { outcome: Outcome } {
  const { reduced, seq, now } = options;
  const context: DemoContext = { author, now };
  const outcome = replyTo(input, catalog, state, context);
  const text = input.trim();
  const gap = reduced ? 0 : REACTION_MS;
  const userMessage: TimedEvent = {
    at: 0,
    event: { type: 'post', message: { key: `${seq}-in`, author, body: textBody(text) } },
  };

  switch (outcome.kind) {
    case 'empty':
      return { events: [], state, outcome };
    case 'text':
    case 'unknown': {
      if (!outcome.reply) return { events: [userMessage], state, outcome };
      if (outcome.reply.ephemeral) {
        const hint: TimedEvent = {
          at: gap,
          event: {
            type: 'post',
            message: { key: `${seq}-out`, author: 'ririko', body: outcome.reply },
          },
        };
        return { events: [userMessage, hint], state, outcome };
      }
      return {
        events: [userMessage, ...typedReply(outcome.reply, author, text, seq, gap, reduced)],
        state,
        outcome,
      };
    }
    case 'command': {
      if (outcome.trigger === '/') {
        const { main, followUp } = splitReply(outcome.reply);
        const think = gap + typingMs('x'.repeat(replyLength(main)), reduced);
        const events: TimedEvent[] = [
          {
            at: 0,
            event: {
              type: 'post',
              message: {
                key: `${seq}-out`,
                author: 'ririko',
                body: { embeds: [], rows: [], ephemeral: main.ephemeral === true },
                interaction: { user: author, command: outcome.name },
                pending: true,
              },
            },
          },
          {
            at: think,
            event: { type: 'resolve', key: `${seq}-out`, body: main, state: outcome.state },
          },
        ];
        if (followUp) {
          events.push(followUpPost(followUp, String(seq), think + (reduced ? 0 : FOLLOW_UP_MS)));
        }
        return { events, state: outcome.state, outcome };
      }
      return {
        events: [
          userMessage,
          ...typedReply(outcome.reply, author, text, seq, gap, reduced, outcome.state),
        ],
        state: outcome.state,
        outcome,
      };
    }
  }
}

/** Typing indicator, then the reply quoting the message it answers. */
function typedReply(
  body: DemoReply,
  user: AuthorId,
  text: string,
  seq: number,
  gap: number,
  reduced: boolean,
  state?: DemoState,
): TimedEvent[] {
  const { main, followUp } = splitReply(body);
  const done = gap + typingMs('x'.repeat(replyLength(main)), reduced);
  const post: DemoEvent = {
    type: 'post',
    message: { key: `${seq}-out`, author: 'ririko', body: main, replyTo: { user, text } },
  };
  if (state) post.state = state;
  const events: TimedEvent[] = [
    { at: gap, event: { type: 'typing', author: 'ririko' } },
    { at: done, event: { type: 'typing', author: null } },
    { at: done, event: post },
  ];
  if (followUp)
    events.push(followUpPost(followUp, String(seq), done + (reduced ? 0 : FOLLOW_UP_MS)));
  return events;
}

/** A card drop, posted at once like the bot does when a channel gets busy. */
export function planDrop(state: DemoState, catalog: DemoCatalog, seq: number): Plan {
  const drop = dropCard(state, catalog.prefix);
  return {
    events: [
      {
        at: 0,
        event: {
          type: 'post',
          message: { key: `${seq}-drop`, author: 'ririko', body: drop.reply, header: true },
          state: drop.state,
        },
      },
    ],
    state: drop.state,
  };
}

/** One step of the scripted show. */
export type ShowStep =
  | { kind: 'pause'; ms: number }
  /** Aiko types, then sends the text (chat or a command). */
  | { kind: 'say'; author: AuthorId; text: string }
  | { kind: 'drop' };

/** The show after the greeting: a member chats, runs two commands, and a card drops. */
export const SHOW: ShowStep[] = [
  { kind: 'pause', ms: 2200 },
  { kind: 'say', author: 'aiko', text: '@Ririko can you play something chill? 🎧' },
  { kind: 'pause', ms: 1600 },
  { kind: 'say', author: 'aiko', text: '/play lofi hip hop radio' },
  { kind: 'pause', ms: 2400 },
  { kind: 'say', author: 'aiko', text: '!daily' },
  { kind: 'pause', ms: 2600 },
  { kind: 'drop' },
  { kind: 'pause', ms: 1400 },
  { kind: 'say', author: 'aiko', text: 'ooh a card! quick, claim it with `/card action:claim` 👀' },
];

/**
 * Turns the show steps into one timeline. Each step starts when the previous one has finished;
 * reduced motion drops every pause and typing delay, so the whole show appears at once.
 */
export function planShow(
  catalog: DemoCatalog,
  state: DemoState,
  options: Omit<PlanOptions, 'seq'> & { seq?: number },
  steps: ShowStep[] = SHOW,
): Plan {
  const { reduced, now } = options;
  let seq = options.seq ?? 1000;
  let offset = 0;
  let current = state;
  const events: TimedEvent[] = [];
  const shift = (list: TimedEvent[]): void => {
    for (const item of list) events.push({ at: offset + item.at, event: item.event });
    offset = Math.max(offset, ...list.map((item) => offset + item.at));
  };

  for (const step of steps) {
    seq += 1;
    if (step.kind === 'pause') {
      if (!reduced) offset += step.ms;
      continue;
    }
    if (step.kind === 'drop') {
      const plan = planDrop(current, catalog, seq);
      shift(plan.events);
      current = plan.state;
      continue;
    }
    const typing = typingMs(step.text, reduced);
    events.push({ at: offset, event: { type: 'typing', author: step.author } });
    offset += typing;
    events.push({ at: offset, event: { type: 'typing', author: null } });
    const plan = planCommand(step.text, step.author, catalog, current, { reduced, seq, now });
    shift(plan.events);
    current = plan.state;
  }
  return { events, state: current };
}

/** Key prefix shared by every message of one planned step. */
function stepOf(key: string): string {
  return key.split('-')[0] ?? key;
}

/**
 * When the show stops early: the remaining posts and replies of steps that already started, so no
 * message is left without its answer or stuck on "thinking". Steps not yet started are dropped.
 */
export function finishStarted(remaining: DemoEvent[], posted: ReadonlySet<string>): DemoEvent[] {
  const started = new Set(Array.from(posted, stepOf));
  return remaining.filter((event) => {
    if (event.type === 'post') return started.has(stepOf(event.message.key));
    if (event.type === 'resolve') return started.has(stepOf(event.key));
    return false;
  });
}

/** Groups timed events by start time, in order, so the runner sets one timer per group. */
export function batchEvents(events: TimedEvent[]): Array<{ at: number; events: DemoEvent[] }> {
  const sorted = events.map((item, index) => ({ item, index }));
  sorted.sort((a, b) => a.item.at - b.item.at || a.index - b.index);
  const batches: Array<{ at: number; events: DemoEvent[] }> = [];
  for (const { item } of sorted) {
    const last = batches[batches.length - 1];
    if (last && last.at === item.at) last.events.push(item.event);
    else batches.push({ at: item.at, events: [item.event] });
  }
  return batches;
}

/** Messages within this gap from the same author are drawn as one group, like the client. */
export const GROUP_GAP_MS = 7 * 60 * 1000;

/** Whether `message` starts a new group (avatar, name and time) after `previous`. */
export function isGroupStart(previous: DemoMessage | undefined, message: DemoMessage): boolean {
  if (!previous) return true;
  if (message.header) return true;
  if (previous.author !== message.author) return true;
  if (message.interaction || message.replyTo) return true;
  if (message.body.ephemeral || previous.body.ephemeral) return true;
  return message.at - previous.at > GROUP_GAP_MS;
}

/** Keeps the newest `max` messages. */
export function trimLog<T>(messages: T[], max = 50): T[] {
  return messages.length > max ? messages.slice(messages.length - max) : messages;
}

/** Whether the reader is close enough to the bottom for new messages to keep them there. */
export function isNearBottom(
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 80,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

/** Applies one event to the message log. */
export function applyEvent(
  messages: DemoMessage[],
  event: DemoEvent,
  now: number,
  max = 50,
): DemoMessage[] {
  if (event.type === 'post') {
    const { key, ...rest } = event.message;
    return trimLog([...messages, { ...rest, id: key, at: now }], max);
  }
  if (event.type === 'resolve') {
    return messages.map((message) => {
      if (message.id !== event.key) return message;
      const { pending: _pending, ...rest } = message;
      return { ...rest, body: event.body };
    });
  }
  return messages;
}
