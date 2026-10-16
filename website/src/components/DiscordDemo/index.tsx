import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import catalog from '../../data/commands.json';
import {
  BellIcon,
  ChannelList,
  HashIcon,
  MemberList,
  MembersIcon,
  MenuIcon,
  PinIcon,
  SearchIcon,
  ServerRail,
  TitleBar,
} from './Chrome';
import { Composer } from './Composer';
import { Message, type Images } from './Message';
import { DISPLAY_NAMES, type DemoCatalog } from './reply';
import {
  applyEvent,
  batchEvents,
  finishStarted,
  isGroupStart,
  isNearBottom,
  planCommand,
  planDrop,
  planGreeting,
  planShow,
  type DemoEvent,
  type TimedEvent,
} from './script';
import { INITIAL_STATE, type AuthorId, type ButtonAction, type DemoMessage } from './types';
import styles from './styles.module.css';

const CATALOG = catalog as DemoCatalog;
const CHIPS = ['/help', '/play lofi hip hop radio', '!ping', '/ai', '!daily', '/card action:claim'];
const PLAYED_KEY = 'ririko-demo-played';
const MAX_MESSAGES = 50;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(PLAYED_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayed(): void {
  try {
    window.sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // Private mode or blocked storage: the show may play again, which is harmless.
  }
}

interface Run {
  batches: Array<{ at: number; events: DemoEvent[] }>;
  fired: Set<number>;
  timers: number[];
}

/**
 * A chat window that looks like the desktop chat app, with Ririko answering commands from the
 * generated catalog. It greets the visitor when it scrolls into view, plays a short scripted
 * show once per visit, and stops the show as soon as the visitor touches it.
 */
export default function DiscordDemo(): ReactNode {
  const images: Images = {
    avatar: useBaseUrl('/img/ririko-avatar.webp'),
    cards: {
      sr: useBaseUrl('/img/demo/card-sr.webp'),
      ur: useBaseUrl('/img/demo/card-ur.webp'),
      r: useBaseUrl('/img/demo/card-r.webp'),
    },
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [typing, setTyping] = useState<AuthorId | null>(null);
  const [unseen, setUnseen] = useState(false);

  const reducedRef = useRef(false);
  const stateRef = useRef(INITIAL_STATE);
  const seqRef = useRef(0);
  const postedRef = useRef(new Set<string>());
  const showRef = useRef<Run | null>(null);
  const userTimersRef = useRef<number[]>([]);
  const startedRef = useRef(false);
  const stickRef = useRef(true);
  const countRef = useRef(0);

  const apply = useCallback((event: DemoEvent, fromShow: boolean): void => {
    if (event.type === 'typing') {
      setTyping(event.author);
      return;
    }
    if (event.type === 'post') postedRef.current.add(event.message.key);
    if (fromShow && event.state) stateRef.current = event.state;
    const now = Date.now();
    setMessages((current) => applyEvent(current, event, now, MAX_MESSAGES));
  }, []);

  /** Runs a plan: events due now apply at once, later ones on timers. */
  const run = useCallback(
    (events: TimedEvent[], fromShow: boolean): Run => {
      const batches = batchEvents(events);
      const handle: Run = { batches, fired: new Set(), timers: [] };
      batches.forEach((batch, index) => {
        const fire = (): void => {
          handle.fired.add(index);
          for (const event of batch.events) apply(event, fromShow);
        };
        if (batch.at <= 0) fire();
        else handle.timers.push(window.setTimeout(fire, batch.at));
      });
      return handle;
    },
    [apply],
  );

  const postGreetingNow = useCallback((): void => {
    if (postedRef.current.has('greeting')) return;
    for (const { event } of planGreeting(true)) apply(event, true);
  }, [apply]);

  /** Stops the show on the first interaction; finishes the steps already under way. */
  const stopShow = useCallback((): void => {
    const show = showRef.current;
    if (!show) {
      if (startedRef.current) return;
      // The visitor reached the window before it started: greet them at once, no show.
      startedRef.current = true;
      markPlayed();
      postGreetingNow();
      return;
    }
    showRef.current = null;
    show.timers.forEach((timer) => window.clearTimeout(timer));
    setTyping(null);
    postGreetingNow();
    const remaining = show.batches.flatMap((batch, index) =>
      show.fired.has(index) ? [] : batch.events,
    );
    for (const event of finishStarted(remaining, postedRef.current)) apply(event, true);
  }, [apply, postGreetingNow]);

  const startShow = useCallback((): void => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (readPlayed()) {
      postGreetingNow();
      return;
    }
    markPlayed();
    const reduced = reducedRef.current;
    const greeting = planGreeting(reduced);
    const greetingEnd = Math.max(...greeting.map((item) => item.at));
    const show = planShow(CATALOG, stateRef.current, { reduced, now: Date.now() });
    showRef.current = run(
      [...greeting, ...show.events.map((item) => ({ ...item, at: item.at + greetingEnd }))],
      true,
    );
  }, [postGreetingNow, run]);

  // Start when the window scrolls into view; clean every timer up on unmount.
  useEffect(() => {
    reducedRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const root = rootRef.current;
    let observer: IntersectionObserver | null = null;
    if (root && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            startShow();
          }
        },
        { threshold: 0.35 },
      );
      observer.observe(root);
    } else {
      startShow();
    }
    const userTimers = userTimersRef.current;
    return () => {
      observer?.disconnect();
      showRef.current?.timers.forEach((timer) => window.clearTimeout(timer));
      userTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [startShow]);

  const send = useCallback(
    (input: string): void => {
      stopShow();
      seqRef.current += 1;
      const plan = planCommand(input, 'you', CATALOG, stateRef.current, {
        reduced: reducedRef.current,
        seq: seqRef.current,
        now: Date.now(),
      });
      // The visitor's own plans commit their state at once, so quick commands chain correctly.
      stateRef.current = plan.state;
      stickRef.current = true;
      const handle = run(plan.events, false);
      userTimersRef.current.push(...handle.timers);
    },
    [run, stopShow],
  );

  const onAction = useCallback(
    (action: ButtonAction): void => {
      if (action.type === 'send') {
        send(action.input);
        return;
      }
      stopShow();
      seqRef.current += 1;
      const plan = planDrop(stateRef.current, CATALOG, seqRef.current);
      stateRef.current = plan.state;
      stickRef.current = true;
      run(plan.events, false);
    },
    [run, send, stopShow],
  );

  const onDismiss = useCallback((id: string): void => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  // Keep the newest message in view only when the reader is already near the bottom.
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const grew = messages.length > countRef.current || typing !== null;
    countRef.current = messages.length;
    if (stickRef.current) {
      list.scrollTop = list.scrollHeight;
      setUnseen(false);
    } else if (grew) {
      setUnseen(true);
    }
  }, [messages, typing]);

  const onScroll = (): void => {
    const list = listRef.current;
    if (!list) return;
    stickRef.current = isNearBottom(list);
    if (stickRef.current) setUnseen(false);
  };

  const jumpToPresent = (): void => {
    const list = listRef.current;
    if (!list) return;
    stickRef.current = true;
    setUnseen(false);
    list.scrollTop = list.scrollHeight;
  };

  return (
    <div className={styles.demo}>
      <div
        ref={rootRef}
        className={styles.window}
        role="region"
        aria-label="Ririko demo chat. Nothing you type leaves this page."
        onPointerDownCapture={stopShow}
        onKeyDownCapture={stopShow}
        onFocusCapture={stopShow}
      >
        <TitleBar />
        <div className={styles.body}>
          <ServerRail images={images} />
          <ChannelList images={images} />
          <section className={styles.chat}>
            <header className={styles.chatHeader}>
              <span className={styles.chatHeaderMenu} aria-hidden="true">
                <MenuIcon />
              </span>
              <span className={styles.chatHeaderHash} aria-hidden="true">
                <HashIcon size={24} />
              </span>
              <h3 className={styles.chatTitle}>general</h3>
              <span className={styles.chatTopic} aria-hidden="true">
                Hang out and try Ririko&apos;s commands
              </span>
              <span className={styles.chatHeaderIcons} aria-hidden="true">
                <BellIcon />
                <PinIcon />
                <MembersIcon />
                <span className={styles.searchBox}>
                  Search
                  <SearchIcon />
                </span>
              </span>
            </header>
            <div className={styles.messagesWrap}>
              <ol
                ref={listRef}
                className={styles.messages}
                role="log"
                aria-live="polite"
                aria-label="Messages in #general"
                tabIndex={0}
                onScroll={onScroll}
              >
                <li className={styles.spacer} aria-hidden="true" />
                <li className={styles.welcome}>
                  <span className={styles.welcomeIcon} aria-hidden="true">
                    <HashIcon size={42} />
                  </span>
                  <span className={styles.welcomeTitle}>Welcome to #general!</span>
                  <span className={styles.welcomeText}>
                    This is the start of the #general channel. Type{' '}
                    <code className={styles.code}>/</code> to see Ririko&apos;s commands; nothing
                    you type leaves this page.
                  </span>
                </li>
                {messages.map((message, index) => (
                  <Message
                    key={message.id}
                    message={message}
                    groupStart={isGroupStart(messages[index - 1], message)}
                    images={images}
                    onAction={onAction}
                    onDismiss={onDismiss}
                  />
                ))}
              </ol>
              {unseen && (
                <button type="button" className={styles.jumpPill} onClick={jumpToPresent}>
                  Jump to present
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 5v14M6 13l6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                  </svg>
                </button>
              )}
            </div>
            <Composer catalog={CATALOG} avatar={images.avatar} onSend={send} />
            <div className={styles.typing} aria-hidden="true">
              {typing && (
                <>
                  <span className={styles.dots}>
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>
                    <strong>{DISPLAY_NAMES[typing]}</strong> is typing...
                  </span>
                </>
              )}
            </div>
          </section>
          <MemberList images={images} />
        </div>
      </div>
      <div className={styles.chips} role="group" aria-label="Try a command in the demo">
        <span className={styles.chipsLabel}>Try:</span>
        {CHIPS.map((chip) => (
          <button key={chip} type="button" className={styles.chip} onClick={() => send(chip)}>
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
