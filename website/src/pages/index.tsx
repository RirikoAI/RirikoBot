import type { ReactNode } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import DiscordDemo from '../components/DiscordDemo';
import commands from '../data/commands.json';
import styles from './index.module.css';

const SUPPORT_SERVER = 'https://discord.gg/UNMZx4qx8G';
const GITHUB = 'https://github.com/RirikoAI/RirikoBot';

interface Feature {
  title: string;
  text: string;
  to: string;
}

const FEATURES: Feature[] = [
  {
    title: 'Music',
    text: 'Play from YouTube, Spotify links, SoundCloud and more, with a queue, filters and a live player message.',
    to: '/docs/music',
  },
  {
    title: 'AI chat and images',
    text: 'Talk to Ririko with Gemini, OpenAI or a local Ollama model. Translate text and generate images.',
    to: '/docs/ai',
  },
  {
    title: 'Waifu TCG',
    text: 'Collect anime cards, trade with friends, craft gear and take on dungeon bosses.',
    to: '/docs/tcg-player-guide',
  },
  {
    title: 'Economy and levels',
    text: 'Earn credits and XP, claim a daily reward, shop, and climb the server ranks.',
    to: '/docs/economy',
  },
  {
    title: 'Moderation',
    text: 'Warnings, timeouts, bans with case history, AutoMod filters and raid alerts.',
    to: '/docs/moderation',
  },
  {
    title: 'Mini-games and fun',
    text: 'Tic-Tac-Toe, rock-paper-scissors, giveaways, reaction GIFs and meme generators.',
    to: '/docs/modules',
  },
  {
    title: 'Web dashboard',
    text: 'Manage every module of your server from a browser, signed in with Discord or a passkey.',
    to: '/docs/dashboard',
  },
  {
    title: 'Self-hosted and open source',
    text: 'Run it yourself with Docker. Your data stays on your machine, with SQLite or PostgreSQL.',
    to: '/docs/deployment',
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

function Hero(): ReactNode {
  const heroImage = useBaseUrl('/img/ririko-hero.webp');
  return (
    <header className={styles.hero} style={{ backgroundImage: `url(${heroImage})` }}>
      <Head>
        <link rel="preload" as="image" type="image/webp" href={heroImage} fetchPriority="high" />
      </Head>
      <div className={styles.heroOverlay}>
        <div className="container">
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              <span className={styles.accent}>Ririko</span> AI
            </h1>
            <p className={styles.heroText}>
              A powerful AI-powered Discord bot that you can call your companion: music, chat, a
              card game, moderation and a dashboard in one open source bot.
            </p>
            <div className={styles.buttons}>
              <Link className="button button--primary button--lg" href={SUPPORT_SERVER}>
                Support server
              </Link>
              <Link className="button button--secondary button--lg" href={GITHUB}>
                GitHub
              </Link>
              <Link
                className={`button button--outline button--secondary button--lg ${styles.heroOutline}`}
                to="/docs/"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function MeetRiriko(): ReactNode {
  return (
    <section className={styles.meet} aria-labelledby="meet-ririko">
      <div className={styles.meetInner}>
        <h2 id="meet-ririko" className={styles.meetTitle}>
          Meet <span className={styles.accent}>Ririko</span>
        </h2>
        <p className={styles.meetText}>
          Say hi, play a song or grab a card. This is a live demo of the bot in a chat channel: type
          a command or press a button. Nothing you type leaves this page.
        </p>
        <DiscordDemo />
      </div>
    </section>
  );
}

function Stats(): ReactNode {
  const stats = [
    { value: commands.commands.length, label: 'commands' },
    { value: commands.categories.length, label: 'categories' },
  ];
  return (
    <section className={styles.stats}>
      <div className="container">
        <div className={styles.statRow}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <div className={styles.statValue}>{stat.value}</div>
              <div>{stat.label}</div>
            </div>
          ))}
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
      <Hero />
      <main>
        <MeetRiriko />
        <Stats />
        <section className="container margin-vert--xl">
          <h2 className={styles.heading}>What Ririko does</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <Link key={feature.title} to={feature.to} className={styles.feature}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </Link>
            ))}
          </div>
          <p className="text--center margin-top--lg">
            <Link className="button button--primary" to="/commands">
              Browse all commands
            </Link>
          </p>
        </section>
        <section className="container margin-vert--xl">
          <h2 className={styles.heading}>Questions</h2>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}
