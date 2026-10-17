import { describe, expect, it } from 'vitest';
import {
  dropCard,
  greetingReply,
  type DemoCatalog,
} from '../website/src/components/DiscordDemo/reply.js';
import {
  FOLLOW_UP_MS,
  GROUP_GAP_MS,
  SHOW,
  applyEvent,
  batchEvents,
  finishStarted,
  isGroupStart,
  isNearBottom,
  planCommand,
  planDrop,
  planGreeting,
  planShow,
  replyLength,
  textBody,
  trimLog,
  typingMs,
  type DemoEvent,
  type TimedEvent,
} from '../website/src/components/DiscordDemo/script.js';
import { INITIAL_STATE, type DemoMessage } from '../website/src/components/DiscordDemo/types.js';

const catalog: DemoCatalog = {
  prefix: '!',
  commands: [
    { name: 'help', description: 'Help.', aliases: [], usage: null, options: [] },
    { name: 'play', description: 'Music.', aliases: ['p'], usage: null, options: [] },
    { name: 'daily', description: 'Reward.', aliases: [], usage: null, options: [] },
    { name: 'ping', description: 'Latency.', aliases: [], usage: null, options: [] },
    { name: 'card', description: 'Cards.', aliases: [], usage: null, options: [] },
  ],
};

const motion = { reduced: false, seq: 7, now: Date.UTC(2026, 9, 16, 12) };
const still = { ...motion, reduced: true };

function posts(events: TimedEvent[]): Array<Extract<DemoEvent, { type: 'post' }>> {
  return events.flatMap(({ event }) => (event.type === 'post' ? [event] : []));
}

function message(partial: Partial<DemoMessage> & Pick<DemoMessage, 'author'>): DemoMessage {
  return { id: 'm', at: 0, body: { embeds: [], rows: [] }, ...partial };
}

describe('typingMs and replyLength', () => {
  it('scales with the text, within limits, and is zero for reduced motion', () => {
    expect(typingMs('hi', false)).toBe(700);
    expect(typingMs('x'.repeat(50), false)).toBe(1150);
    expect(typingMs('x'.repeat(500), false)).toBe(1800);
    expect(typingMs('x'.repeat(500), true)).toBe(0);
  });

  it('counts content in full and embeds at a third', () => {
    expect(replyLength({ content: 'abcd', embeds: [], rows: [] })).toBe(4);
    expect(
      replyLength({
        embeds: [
          {
            color: 0,
            title: 'abc',
            description: 'abc',
            fields: [{ name: 'a', value: 'bc', inline: true }],
          },
        ],
        rows: [],
      }),
    ).toBe(3);
  });
});

describe('planGreeting', () => {
  it('types, then posts the greeting with its buttons', () => {
    const plan = planGreeting(false);
    expect(plan.map((item) => [item.at, item.event.type])).toEqual([
      [500, 'typing'],
      [500 + typingMs(greetingReply().content ?? '', false), 'typing'],
      [500 + typingMs(greetingReply().content ?? '', false), 'post'],
    ]);
    expect(posts(plan)[0]?.message).toEqual({
      key: 'greeting',
      author: 'ririko',
      body: greetingReply(),
    });
  });

  it('has no delay at all with reduced motion', () => {
    expect(planGreeting(true).every((item) => item.at === 0)).toBe(true);
  });
});

describe('planCommand', () => {
  it('slash commands post a thinking placeholder, then resolve it with the reply', () => {
    const plan = planCommand('/ping', 'you', catalog, INITIAL_STATE, motion);
    expect(plan.events).toHaveLength(2);
    const [placeholder, done] = plan.events;
    expect(placeholder).toMatchObject({
      at: 0,
      event: {
        type: 'post',
        message: {
          key: '7-out',
          author: 'ririko',
          interaction: { user: 'you', command: 'ping' },
          pending: true,
        },
      },
    });
    expect(done?.at).toBeGreaterThan(0);
    expect(done?.event).toMatchObject({ type: 'resolve', key: '7-out' });
    if (done?.event.type !== 'resolve') throw new Error('resolve expected');
    expect(done.event.body.content).toContain('Pong!');
  });

  it('a slash reply with a follow-up posts the player as its own message after the answer', () => {
    const plan = planCommand('/play lofi', 'you', catalog, INITIAL_STATE, motion);
    expect(plan.events.map(({ event }) => event.type)).toEqual(['post', 'resolve', 'post']);
    const [, resolved, follow] = plan.events;
    if (resolved?.event.type !== 'resolve') throw new Error('resolve expected');
    expect(resolved.event.body.embeds[0]?.title).toBe('🎵 Now Playing');
    expect(resolved.event.body.followUp).toBeUndefined();
    expect(follow?.at).toBe(resolved.at + FOLLOW_UP_MS);
    if (follow?.event.type !== 'post') throw new Error('post expected');
    expect(follow.event.message).toMatchObject({ key: '7-out2', author: 'ririko', header: true });
    expect(follow.event.message.body.embeds[0]?.title).toBe('[🎵 Lofi](https://ririko.ai)');
    expect(follow.event.message.interaction).toBeUndefined();
    // The follow-up belongs to the same step, so a stopped show still delivers it.
    expect(finishStarted([follow.event], new Set(['7-out']))).toEqual([follow.event]);
    // A second /play only adds to the queue.
    const again = planCommand('/play city pop', 'you', catalog, plan.state, { ...motion, seq: 8 });
    expect(again.events).toHaveLength(2);
    // Reduced motion shows both at once.
    const quick = planCommand('/play lofi', 'you', catalog, INITIAL_STATE, still);
    expect(quick.events.every(({ at }) => at === 0)).toBe(true);
  });

  it('a prefix reply with a follow-up posts it after the quoted answer', () => {
    const plan = planCommand('!play lofi', 'aiko', catalog, INITIAL_STATE, motion);
    const shown = posts(plan.events);
    expect(shown.map((p) => p.message.key)).toEqual(['7-in', '7-out', '7-out2']);
    expect(shown[1]?.message.replyTo).toEqual({ user: 'aiko', text: '!play lofi' });
    expect(shown[1]?.message.body.followUp).toBeUndefined();
    expect(shown[2]?.message.header).toBe(true);
    const answerAt = plan.events.find(
      ({ event }) => event.type === 'post' && event.message.key === '7-out',
    )?.at;
    const followAt = plan.events.find(
      ({ event }) => event.type === 'post' && event.message.key === '7-out2',
    )?.at;
    expect(followAt).toBe((answerAt ?? 0) + FOLLOW_UP_MS);
  });

  it('prefix commands post the message, show typing, then reply to it', () => {
    const plan = planCommand('!daily', 'aiko', catalog, INITIAL_STATE, motion);
    expect(plan.events.map(({ at, event }) => [at, event.type])).toEqual([
      [0, 'post'],
      [350, 'typing'],
      [plan.events[2]!.at, 'typing'],
      [plan.events[2]!.at, 'post'],
    ]);
    const [question, answer] = posts(plan.events);
    expect(question?.message).toMatchObject({ key: '7-in', author: 'aiko' });
    expect(question?.message.body.content).toBe('!daily');
    expect(answer?.message).toMatchObject({
      author: 'ririko',
      replyTo: { user: 'aiko', text: '!daily' },
    });
    expect(answer?.state?.dailyClaimed).toEqual(['aiko']);
    expect(plan.state.dailyClaimed).toEqual(['aiko']);
  });

  it('plain chat from a member posts only the message', () => {
    const plan = planCommand('nice song', 'aiko', catalog, INITIAL_STATE, motion);
    expect(posts(plan.events).map((p) => p.message.author)).toEqual(['aiko']);
    expect(plan.outcome.kind).toBe('text');
  });

  it('a mention gets a typed answer that quotes it', () => {
    const plan = planCommand('@Ririko hello', 'you', catalog, INITIAL_STATE, motion);
    const [question, answer] = posts(plan.events);
    expect(question?.message.body.content).toBe('<@Ririko> hello');
    expect(answer?.message.replyTo).toEqual({ user: 'you', text: '@Ririko hello' });
    expect(plan.events.some(({ event }) => event.type === 'typing')).toBe(true);
  });

  it('hints and unknown commands answer at once with an ephemeral message', () => {
    for (const input of ['hello', '/nope', '!nope']) {
      const plan = planCommand(input, 'you', catalog, INITIAL_STATE, motion);
      const [own, hint] = posts(plan.events);
      expect(own?.message.body.content).toBe(input);
      expect(hint?.message.body.ephemeral).toBe(true);
      expect(plan.events.some(({ event }) => event.type === 'typing')).toBe(false);
    }
  });

  it('does nothing for empty input', () => {
    expect(planCommand('  ', 'you', catalog, INITIAL_STATE, motion).events).toEqual([]);
  });

  it('runs everything at once with reduced motion', () => {
    const plan = planCommand('!ping', 'you', catalog, INITIAL_STATE, still);
    expect(plan.events.every(({ at }) => at === 0)).toBe(true);
  });
});

describe('textBody', () => {
  it('shows @Ririko as a mention and leaves other text alone', () => {
    expect(textBody('hi @Ririko!').content).toBe('hi <@Ririko>!');
    expect(textBody('@ririko').content).toBe('<@Ririko>');
    expect(textBody('mail@ririko.ai').content).toBe('mail@ririko.ai');
    expect(textBody('!ping')).toEqual({ content: '!ping', embeds: [], rows: [] });
  });
});

describe('planDrop', () => {
  it('posts the drop at once and carries the new state', () => {
    const plan = planDrop(INITIAL_STATE, catalog, 3);
    const expected = dropCard(INITIAL_STATE, '!');
    expect(plan.state).toEqual(expected.state);
    expect(plan.events).toEqual([
      {
        at: 0,
        event: {
          type: 'post',
          message: { key: '3-drop', author: 'ririko', body: expected.reply, header: true },
          state: expected.state,
        },
      },
    ]);
  });
});

describe('planShow', () => {
  const show = planShow(catalog, INITIAL_STATE, { reduced: false, now: motion.now });

  it('has a member chat, run /play and !daily, and ends with an unclaimed card drop', () => {
    const shown = posts(show.events).map((p) => [p.message.author, p.message.body.content ?? '']);
    expect(shown[0]).toEqual(['aiko', '<@Ririko> can you play something chill? 🎧']);
    expect(shown.filter(([author]) => author === 'aiko').map(([, text]) => text)).toEqual([
      '<@Ririko> can you play something chill? 🎧',
      '!daily',
      'ooh a card! quick, claim it with `/card action:claim` 👀',
    ]);
    const slash = posts(show.events).find((p) => p.message.interaction);
    expect(slash?.message.interaction).toEqual({ user: 'aiko', command: 'play' });
    expect(show.state.queue).toHaveLength(1);
    // /play brings up the player message right after the first track's "Now Playing" answer.
    const player = posts(show.events).find((p) => p.message.header);
    expect(player?.message.author).toBe('ririko');
    expect(player?.message.body.rows).toHaveLength(2);
    expect(show.state.dailyClaimed).toEqual(['aiko']);
    expect(show.state.drop).not.toBeNull();
  });

  it('keeps events in time order with real pauses, and every typing indicator is cleared', () => {
    const times = show.events.map((item) => item.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[0]).toBe(2200);
    const pauses = SHOW.reduce((sum, step) => sum + (step.kind === 'pause' ? step.ms : 0), 0);
    expect(times[times.length - 1]!).toBeGreaterThan(pauses);
    const typing = show.events.flatMap(({ event }) => (event.type === 'typing' ? [event] : []));
    expect(typing[typing.length - 1]?.author).toBeNull();
  });

  it('uses unique message keys', () => {
    const keys = posts(show.events).map((p) => p.message.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('collapses to time zero with reduced motion', () => {
    const quick = planShow(catalog, INITIAL_STATE, { reduced: true, now: motion.now });
    expect(quick.events.every((item) => item.at === 0)).toBe(true);
    expect(quick.state).toEqual(show.state);
  });

  it('accepts custom steps', () => {
    const custom = planShow(catalog, INITIAL_STATE, { reduced: true, now: 0, seq: 1 }, [
      { kind: 'drop' },
    ]);
    expect(posts(custom.events)[0]?.message.key).toBe('2-drop');
  });
});

describe('batchEvents and finishStarted', () => {
  it('groups events by time and keeps their order', () => {
    const a: DemoEvent = { type: 'typing', author: 'aiko' };
    const b: DemoEvent = { type: 'typing', author: null };
    const c: DemoEvent = { type: 'typing', author: 'ririko' };
    expect(
      batchEvents([
        { at: 10, event: b },
        { at: 0, event: a },
        { at: 10, event: c },
      ]),
    ).toEqual([
      { at: 0, events: [a] },
      { at: 10, events: [b, c] },
    ]);
  });

  it('finishes the steps that started and drops the rest', () => {
    const plan = planCommand('/ping', 'aiko', catalog, INITIAL_STATE, motion);
    const later = planCommand('!daily', 'aiko', catalog, INITIAL_STATE, { ...motion, seq: 8 });
    const remaining = [plan.events[1]!.event, ...later.events.map((item) => item.event)];
    const finished = finishStarted(remaining, new Set(['7-out', 'greeting']));
    expect(finished).toEqual([plan.events[1]!.event]);
    expect(finishStarted(remaining, new Set())).toEqual([]);
  });
});

describe('message log helpers', () => {
  it('groups consecutive messages by author within the gap', () => {
    const first = message({ author: 'aiko', at: 0 });
    expect(isGroupStart(undefined, first)).toBe(true);
    expect(isGroupStart(first, message({ author: 'aiko', at: 1000 }))).toBe(false);
    expect(isGroupStart(first, message({ author: 'ririko', at: 1000 }))).toBe(true);
    expect(isGroupStart(first, message({ author: 'aiko', at: GROUP_GAP_MS + 1 }))).toBe(true);
    expect(
      isGroupStart(first, message({ author: 'aiko', replyTo: { user: 'you', text: 'x' } })),
    ).toBe(true);
    expect(
      isGroupStart(first, message({ author: 'aiko', interaction: { user: 'you', command: 'x' } })),
    ).toBe(true);
    expect(
      isGroupStart(
        first,
        message({ author: 'aiko', body: { embeds: [], rows: [], ephemeral: true } }),
      ),
    ).toBe(true);
    expect(isGroupStart(first, message({ author: 'aiko', at: 1000, header: true }))).toBe(true);
  });

  it('keeps the newest messages', () => {
    expect(trimLog([1, 2, 3], 2)).toEqual([2, 3]);
    const short = [1, 2];
    expect(trimLog(short, 5)).toBe(short);
    expect(trimLog(Array.from({ length: 60 }, (_, i) => i))).toHaveLength(50);
  });

  it('sticks to the bottom only within the threshold', () => {
    expect(isNearBottom({ scrollTop: 920, scrollHeight: 1500, clientHeight: 500 })).toBe(true);
    expect(isNearBottom({ scrollTop: 900, scrollHeight: 1500, clientHeight: 500 })).toBe(false);
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 500 })).toBe(true);
  });

  it('applies posts and resolves to the log', () => {
    const plan = planCommand('/ping', 'you', catalog, INITIAL_STATE, motion);
    let log: DemoMessage[] = [];
    log = applyEvent(log, plan.events[0]!.event, 1234);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ id: '7-out', at: 1234, pending: true });
    log = applyEvent(log, plan.events[1]!.event, 9999);
    expect(log[0]?.pending).toBeUndefined();
    expect(log[0]?.at).toBe(1234);
    expect(log[0]?.body.content).toContain('Pong!');
    expect(applyEvent(log, { type: 'typing', author: 'ririko' }, 0)).toBe(log);
    const full = Array.from({ length: 3 }, (_, i) => message({ id: `${i}`, author: 'aiko' }));
    const added = applyEvent(full, posts(plan.events)[0]!, 0, 3);
    expect(added.map((m) => m.id)).toEqual(['1', '2', '7-out']);
  });
});
