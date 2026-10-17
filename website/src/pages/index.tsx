import type { ReactNode } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import DiscordDemo from '../components/DiscordDemo';
import SectionNav from '../components/SectionNav';
import commands from '../data/commands.json';
import dashboardShot from '../../../docs/img/dashboard-overview.webp';
import musicShot from '../../../docs/img/music-now-playing.webp';
import styles from './index.module.css';

const SUPPORT_SERVER = 'https://discord.gg/UNMZx4qx8G';
const GITHUB = 'https://github.com/RirikoAI/RirikoBot';

interface Feature {
  title: string;
  text: string;
  to: string;
}

/** What Ririko can do. The text stays in step with the docs page each item links to. */
const FEATURES = {
  tcg: {
    title: 'Waifu TCG',
    text: 'Collect anime cards, trade with friends, craft gear and take on dungeon bosses.',
    to: '/docs/tcg-player-guide',
  },
  music: {
    title: 'Music',
    text: 'Play from YouTube, Spotify links, SoundCloud and more, with a queue, filters and a live player message.',
    to: '/docs/music',
  },
  ai: {
    title: 'AI chat and images',
    text: 'Talk to Ririko with Gemini, OpenAI or a local Ollama model. Translate text and generate images.',
    to: '/docs/ai',
  },
  economy: {
    title: 'Economy and levels',
    text: 'Earn credits and XP, claim a daily reward, shop, and climb the server ranks.',
    to: '/docs/economy',
  },
  moderation: {
    title: 'Moderation',
    text: 'Warnings, timeouts, bans with case history, AutoMod filters and raid alerts.',
    to: '/docs/moderation',
  },
  games: {
    title: 'Mini-games and fun',
    text: 'Tic-Tac-Toe, rock-paper-scissors, giveaways, reaction GIFs and meme generators.',
    to: '/docs/modules',
  },
} satisfies Record<string, Feature>;

/** The ruled list under the headliners. */
const MORE_FEATURES: Feature[] = [FEATURES.economy, FEATURES.moderation, FEATURES.games];

/** Command categories with their command counts, the biggest first. */
const CATEGORIES = commands.categories
  .map((category) => ({
    ...category,
    count: commands.commands.filter((command) => command.category === category.id).length,
  }))
  .filter((category) => category.count > 0)
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

/** The size of a category in the wall: bigger word, more commands. */
function wallSize(count: number): string {
  if (count >= 14) return styles.wallL;
  if (count >= 5) return styles.wallM;
  return styles.wallS;
}

/** The facts of "Yours to run". */
const FACTS: { term: string; detail: ReactNode }[] = [
  {
    term: 'MIT license',
    detail:
      'Free and open source. You only pay for the services you choose to connect, such as a hosting machine or an AI provider key.',
  },
  {
    term: 'Docker',
    detail: 'Run it with Docker and Compose. Your data stays on your own machine.',
  },
  {
    term: 'SQLite or PostgreSQL',
    detail: 'Your data lives in your own database, and secrets never go into it in plain text.',
  },
  {
    term: 'Setup wizard',
    detail: (
      <>
        <code>ririko setup</code> opens in your browser, guides you through the Discord application,
        checks your values and writes <code>.env.production</code>.
      </>
    ),
  },
  {
    term: '1.4 migration',
    detail:
      'The migration tool moves your 1.4 database to 2.0 safely and can be run again without harm.',
  },
  {
    term: 'Dashboard',
    detail:
      'Manage every module of your server from a browser, signed in with Discord or a passkey.',
  },
];

/** Steps 1 to 3 of "Quick start with Docker" in README.md, copied as they are. */
const QUICK_START: { label: string; code: string }[] = [
  {
    label: 'Clone the repository and check out the release',
    code: [
      'git clone https://github.com/RirikoAI/RirikoBot.git',
      'cd RirikoBot',
      'git checkout v2.0.0',
    ].join('\n'),
  },
  {
    label: 'Run the setup wizard',
    code: 'docker run --rm -it -p 127.0.0.1:3999:3999 -v "$PWD:/setup" ririkoai/ririkobot:2 ririko setup --docker --env-file /setup/.env.production --listen 0.0.0.0 --no-open',
  },
  {
    label: 'Start the stack',
    code: 'docker compose -f docker-compose.production.yml --env-file .env.production up -d',
  },
];

interface Question {
  question: string;
  answer: ReactNode;
}

const FAQ: Question[] = [
  {
    question: 'What is Ririko AI?',
    answer:
      'Ririko AI is an open source Discord bot with music, AI chat, moderation, an economy, a card game and a web dashboard. Version 2.0 is a full rewrite of Ririko 1.4 that keeps every command you know.',
  },
  {
    question: 'Is Ririko free?',
    answer:
      'Yes. The bot is open source under the MIT license. You only pay for the services you choose to connect, such as a hosting machine or an AI provider key.',
  },
  {
    question: 'How do I add Ririko to my server?',
    answer: (
      <>
        There is no public invite link yet: it opens when 2.0 launches. Until then you can run your
        own copy by following <Link to="/docs/deployment">Deploy Ririko With Docker</Link>, and ask
        for news in the <Link href={SUPPORT_SERVER}>support server</Link>.
      </>
    ),
  },
  {
    question: 'Do I use slash commands or a prefix?',
    answer: (
      <>
        Both work. Every command has a slash form and a prefix form (the default prefix is{' '}
        <code>{commands.prefix}</code>, and each server can change it). See the{' '}
        <Link to="/commands">command reference</Link>.
      </>
    ),
  },
  {
    question: 'I use Ririko 1.4. Can I move my data?',
    answer: (
      <>
        Yes. The migration tool moves your 1.4 database to 2.0 safely and can be run again without
        harm. Start with <Link to="/docs/upgrading-from-1.4">Upgrade From Ririko 1.4.0 to 2.0</Link>
        .
      </>
    ),
  },
  {
    question: 'What happens to my data?',
    answer: (
      <>
        A self-hosted Ririko keeps its data in your own database, and secrets never go into it in
        plain text. Read the <Link to="/docs/legal/terms">Terms</Link> and the{' '}
        <Link to="/docs/legal/privacy">Privacy Policy</Link>.
      </>
    ),
  },
  {
    question: 'How can I help?',
    answer: (
      <>
        Report a problem or send a pull request on <Link href={GITHUB}>GitHub</Link>. The{' '}
        <Link to="/docs/contributing">contributor guide</Link> explains the rules.
      </>
    ),
  },
];

/** The home page sections, in order. The section navigator reads this list. */
const SECTIONS = [
  { id: 'hero', label: 'Ririko' },
  { id: 'meet', label: 'Meet Ririko' },
  { id: 'abilities', label: 'What Ririko can do' },
  { id: 'open-source', label: 'Yours to run' },
  { id: 'get-started', label: 'Get started' },
];

function ArrowDown(): ReactNode {
  return (
    <svg className={styles.cueArrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function Hero(): ReactNode {
  const heroImage = useBaseUrl('/img/ririko-hero.webp');
  const commandCount = commands.commands.length;
  const categoryCount = commands.categories.length;
  return (
    <section id="hero" className={`${styles.hero} ${styles.snap}`} aria-labelledby="hero-title">
      <Head>
        <link rel="preload" as="image" type="image/webp" href={heroImage} fetchPriority="high" />
      </Head>
      <div className={styles.heroArt}>
        <img
          className={styles.heroImage}
          src={heroImage}
          width={1672}
          height={940}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <div className={styles.heroBody}>
        <h1 id="hero-title" className={styles.wordmark}>
          <span className={styles.wordmarkName}>Ririko</span>{' '}
          <span className={styles.wordmarkAi}>AI</span>
        </h1>
        <p className={styles.tagline}>
          Meet your server&apos;s new best friend: an AI companion who plays, chats and keeps the
          peace.
        </p>
        <p className={styles.heroNote}>You may not need another Discord bot after this.</p>
        <div className={styles.actions}>
          <Link className={`${styles.btn} ${styles.btnPrimary}`} to="/docs/deployment">
            Run your own Ririko
          </Link>
          <Link className={`${styles.btn} ${styles.btnGhost}`} href={SUPPORT_SERVER}>
            Join the support server
          </Link>
        </div>
        <p className={styles.commandsLink}>
          <Link to="/commands">Browse all {commandCount} commands</Link>
        </p>
        <dl className={styles.cover}>
          <div className={styles.coverItem}>
            <dt className={styles.coverLabel}>slash and prefix commands</dt>
            <dd className={styles.coverValue}>{commandCount}</dd>
          </div>
          <div className={styles.coverItem}>
            <dt className={styles.coverLabel}>categories</dt>
            <dd className={styles.coverValue}>{categoryCount}</dd>
          </div>
          <div className={styles.coverItem}>
            <dt className={styles.coverLabel}>
              open source, <span className={styles.nowrap}>self-hosted</span>
            </dt>
            <dd className={styles.coverValue}>MIT</dd>
          </div>
        </dl>
      </div>
      <a className={styles.cue} href="#meet">
        Meet Ririko
        <ArrowDown />
      </a>
    </section>
  );
}

function MeetRiriko(): ReactNode {
  return (
    <section
      id="meet"
      className={`${styles.meet} ${styles.gummyTop} ${styles.snap}`}
      aria-labelledby="meet-title"
    >
      <div className={styles.wrap}>
        <header className={`${styles.meetHead} ${styles.reveal}`}>
          <div>
            <p className={styles.num}>01</p>
            <h2 id="meet-title" className={styles.h2}>
              Meet <span className={styles.pink}>Ririko</span>
            </h2>
          </div>
          <div className={styles.meetCopy}>
            <p>
              Say hi, play a song or grab a card. This is a live demo of the bot in a chat channel:
              type a command or press a button. Nothing you type leaves this page.
            </p>
          </div>
        </header>
        <DiscordDemo />
      </div>
    </section>
  );
}

function ArrowRight({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function Abilities(): ReactNode {
  const cards = [
    { src: useBaseUrl('/img/demo/card-r.webp'), alt: 'A Rare Ririko card with a fire element' },
    {
      src: useBaseUrl('/img/demo/card-sr.webp'),
      alt: 'A Super Rare Ririko card with an ice element',
    },
    {
      src: useBaseUrl('/img/demo/card-ur.webp'),
      alt: 'An Ultra Rare Ririko card with a lightning element',
    },
  ];
  return (
    <section
      id="abilities"
      className={`${styles.abilities} ${styles.snap}`}
      aria-labelledby="abilities-title"
    >
      <div className={styles.wrap}>
        <header className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.num}>02</p>
          <h2 id="abilities-title" className={styles.h2}>
            What Ririko can do
          </h2>
          <p className={styles.deck}>
            Cards, music, AI chat and a whole server toolbox. Every command works as a slash command
            or with a prefix.
          </p>
        </header>

        <div className={styles.headline}>
          <div className={styles.lead}>
            <div className={`${styles.leadText} ${styles.reveal}`}>
              <h3>
                Waifu <span>TCG</span>
              </h3>
              <p>{FEATURES.tcg.text}</p>
              <Link className={styles.moreLink} to={FEATURES.tcg.to}>
                Read the player guide
                <ArrowRight />
              </Link>
            </div>
            <div>
              <div className={styles.fan}>
                {cards.map((card) => (
                  <img
                    key={card.src}
                    className={styles.fanCard}
                    src={card.src}
                    width={480}
                    height={720}
                    alt={card.alt}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
              <p className={styles.fanCaption}>Rare, Super Rare and Ultra Rare cards of Ririko.</p>
            </div>
          </div>

          <div className={styles.second}>
            <figure className={styles.shot}>
              <div className={styles.shotFrame}>
                <img
                  src={musicShot}
                  width={815}
                  height={519}
                  alt="The live player message of Ririko in Discord: the track title, a progress bar, the requester and source, and buttons for loop, shuffle, lyrics and the queue."
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className={styles.shotCaption}>
                The live player message: it updates as the song plays.
              </figcaption>
            </figure>
            <div className={`${styles.secondText} ${styles.reveal}`}>
              <h3>{FEATURES.music.title}</h3>
              <p>{FEATURES.music.text}</p>
              <Link className={styles.moreLink} to={FEATURES.music.to}>
                Read about music
                <ArrowRight />
              </Link>
            </div>
          </div>

          <div className={styles.ai}>
            <p className={`${styles.aiBig} ${styles.reveal}`} aria-hidden="true">
              Gemini, OpenAI
              <em>
                <span>or</span> Ollama
              </em>
            </p>
            <div className={`${styles.aiText} ${styles.reveal}`}>
              <h3>{FEATURES.ai.title}</h3>
              <p>{FEATURES.ai.text}</p>
              <Link className={styles.moreLink} to={FEATURES.ai.to}>
                Read about AI chat and images
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>

        <ul className={styles.trio}>
          {MORE_FEATURES.map((feature) => (
            <li key={feature.title} className={`${styles.trioItem} ${styles.reveal}`}>
              <h3>
                <Link to={feature.to}>{feature.title}</Link>
              </h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>

        <div className={styles.wall}>
          <div className={`${styles.wallHead} ${styles.reveal}`}>
            <h3>All {commands.commands.length} commands, by category</h3>
            <Link className={styles.moreLink} to="/commands">
              Open the command reference
              <ArrowRight />
            </Link>
          </div>
          <ul className={styles.wallList}>
            {CATEGORIES.map((category) => (
              <li key={category.id} className={wallSize(category.count)}>
                <Link to={`/commands#${category.id}`}>
                  {category.label}
                  <span className={styles.wallCount}>
                    {category.count}
                    <span className={styles.vh}> commands</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function OpenSource(): ReactNode {
  return (
    <section
      id="open-source"
      className={`${styles.openSource} ${styles.gummyTop} ${styles.snap}`}
      aria-labelledby="open-source-title"
    >
      <div className={styles.wrap}>
        <div className={styles.openTop}>
          <div>
            <header className={styles.reveal}>
              <p className={styles.num}>03</p>
              <h2 id="open-source-title" className={styles.h2}>
                Yours to run
              </h2>
              <p className={styles.openLead}>
                Ririko is open source. Run your own copy, keep your data, and change what you want.
              </p>
            </header>
            <dl className={styles.facts}>
              {FACTS.map((fact) => (
                <div key={fact.term} className={`${styles.fact} ${styles.reveal}`}>
                  <dt>{fact.term}</dt>
                  <dd>{fact.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <figure className={styles.dashFigure}>
            <div className={styles.dashFrame}>
              <img
                src={dashboardShot}
                width={1170}
                height={1261}
                alt="The Ririko web dashboard overview of a server: member and voice numbers, a chart of the commands run in the last 30 days, the most used commands, and a menu of modules on the left."
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className={styles.dashCaption}>
              The dashboard: every module of your server, in a browser.
            </figcaption>
          </figure>
        </div>

        <div className={styles.quick}>
          <h3>Quick start</h3>
          <p className={styles.quickNote}>
            You need Docker 23 or newer with Compose v2, Git and a Discord account. These are the
            first three steps of the README.
          </p>
          <ol className={styles.quickSteps}>
            {QUICK_START.map((step, index) => (
              <li key={step.label} className={styles.quickStep}>
                <span className={styles.stepNum} aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p className={styles.stepLabel}>{step.label}</p>
                  <pre>
                    <code>{step.code}</code>
                  </pre>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.quickMore}>
            Then add the bot to your server and register the slash commands. The guide{' '}
            <Link to="/docs/deployment">Deploy Ririko With Docker</Link> explains every step.
          </p>
        </div>

        <ul className={styles.openLinks}>
          <li>
            <Link href={GITHUB}>
              Ririko on GitHub
              <ArrowRight />
            </Link>
          </li>
          <li>
            <Link to="/docs/deployment">
              Deploy with Docker
              <ArrowRight />
            </Link>
          </li>
          <li>
            <Link to="/docs/upgrading-from-1.4">
              Upgrade from 1.4
              <ArrowRight />
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

function GetStarted(): ReactNode {
  const paths: { title: string; text: string; to?: string; href?: string }[] = [
    {
      title: 'Run your own',
      text: 'Follow the Docker guide and have your own copy of Ririko running.',
      to: '/docs/deployment',
    },
    {
      title: 'Join the support server',
      text: 'Ask for help, ask for news, or just chat.',
      href: SUPPORT_SERVER,
    },
    {
      title: 'Browse the commands',
      text: `${commands.commands.length} commands, each with its options, examples and permissions.`,
      to: '/commands',
    },
  ];
  return (
    <section
      id="get-started"
      className={`${styles.getStarted} ${styles.gummyTop}`}
      aria-labelledby="get-started-title"
    >
      <div className={styles.wrap}>
        <header className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.num}>04</p>
          <h2 id="get-started-title" className={styles.h2}>
            Get started
          </h2>
        </header>
        <ul className={styles.paths}>
          {paths.map((path) => (
            <li key={path.title} className={`${styles.path} ${styles.reveal}`}>
              <h3>
                <Link {...(path.href ? { href: path.href } : { to: path.to })}>
                  {path.title.slice(0, path.title.lastIndexOf(' ') + 1)}
                  <span className={styles.nowrap}>
                    {path.title.slice(path.title.lastIndexOf(' ') + 1)}
                    <ArrowRight className={styles.pathArrow} />
                  </span>
                </Link>
              </h3>
              <p>{path.text}</p>
            </li>
          ))}
        </ul>
        <p className={styles.inviteNote}>
          There is no public invite link yet: it opens when 2.0 launches. Until then, run your own
          copy.
        </p>

        <div className={styles.faqLayout}>
          <div className={`${styles.faqHead} ${styles.reveal}`}>
            <h3>Questions people ask</h3>
            <p className={styles.faqIntro}>
              Cannot find your answer? Ask in the <Link href={SUPPORT_SERVER}>support server</Link>.
            </p>
          </div>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.question}</summary>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Ririko AI"
      description="Ririko AI is an open source Discord bot with music, AI chat, moderation, an economy, a card game and a web dashboard."
    >
      <Head>
        <html className="ririko-home" />
      </Head>
      <main className={styles.page}>
        <Hero />
        <MeetRiriko />
        <Abilities />
        <OpenSource />
        <GetStarted />
      </main>
      <SectionNav sections={SECTIONS} />
    </Layout>
  );
}
