import { describe, expect, it } from 'vitest';
import {
  buildInviteUrl,
  conditionalCss,
  escapeHtml,
  iconSvg,
  nextCommands,
  renderLegalPage,
  renderMarkdown,
  renderMessagePage,
  renderResultPage,
  renderStepPage,
  summaryRows,
  type StepView,
} from './render.js';
import { PAGES, getPage, type Answers, type PageId, type Profile } from './steps.js';

function view(
  id: PageId,
  overrides: Partial<StepView> = {},
  profile: Profile = 'source',
): StepView {
  return {
    profile,
    page: getPage(id),
    answers: { values: {}, switches: {} },
    csrf: 'csrf-token',
    completed: new Set<PageId>(),
    issues: new Map(),
    checkLines: [],
    targetFile: '/repo/.env',
    fileExists: false,
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escapes the characters that matter in text and attributes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('iconSvg', () => {
  it('draws every icon the pages name and falls back for an unknown one', () => {
    for (const page of PAGES) expect(iconSvg(page.icon)).toContain('<svg');
    expect(iconSvg('nothing')).toBe(iconSvg('hand-wave'));
  });
});

describe('renderMarkdown', () => {
  it('renders headings, paragraphs, lists, rules and tables', () => {
    const html = renderMarkdown(
      [
        '# Title',
        '',
        'First line',
        'second line.',
        '',
        '- one',
        '- two',
        '',
        '---',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n'),
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<p>First line second line.</p>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<th>A</th><th>B</th>');
    expect(html).toContain('<td>1</td><td>2</td>');
  });

  it('keeps https links and the two legal texts, and drops every other link', () => {
    const html = renderMarkdown(
      '[T](terms.md) [P](privacy.md) [D](https://discord.com/terms) [X](javascript:alert(1)) [W](../waifu-tcg.md)',
    );
    expect(html).toContain('<a href="/legal/terms">T</a>');
    expect(html).toContain('<a href="/legal/privacy">P</a>');
    expect(html).toContain(
      '<a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer">D</a>',
    );
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('waifu-tcg.md');
  });

  it('escapes HTML, renders code and bold, and does not render emphasis inside code', () => {
    const html = renderMarkdown('<script>x</script> **bold** `**not bold** <b>`');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>**not bold** &lt;b&gt;</code>');
  });
});

describe('pages', () => {
  it('renders every page without a script, with the tab row and the form token', () => {
    for (const page of PAGES) {
      const html = renderStepPage(
        view(page.id, { install: { summary: [], inviteUrl: null, writeErrors: [] } }),
      );
      expect(html, page.id).not.toMatch(/<script/i);
      expect(html, page.id).toContain('class="steps"');
      expect(html, page.id).toContain('name="_csrf" value="csrf-token"');
      expect(html, page.id).toContain('<form class="content" method="post"');
      expect(html, page.id).toMatch(/<li class="current">/);
    }
  });

  it('marks finished pages as done and links only pages that can be opened', () => {
    const html = renderStepPage(view('ai', { completed: new Set<PageId>(['welcome', 'discord']) }));
    expect(html).toContain('<li class="done"><a class="step-link" href="/step/welcome">');
    expect(html).toContain('<li class="done"><a class="step-link" href="/step/discord">');
    expect(html).toContain('<li class=""><span class="step-link">');
    expect(html).not.toContain('href="/step/streams"');
  });

  it('shows the guide button, numbered steps and full-size image links', () => {
    const html = renderStepPage(view('streams'));
    expect(html).toContain('Click here to show/hide the guide: ');
    expect(html).toContain('id="guide-twitch-step-1"');
    expect(html).toMatch(/<a class="guide-image" href="#img-1">/);
    expect(html).toMatch(/<div class="lightbox" id="img-1">/);
    expect(html).toContain('/assets/images/twitch-step1.png');
  });

  it('uses the single-guide wording and fills in the dashboard address', () => {
    const answers: Answers = { values: { DASHBOARD_URL: 'https://bot.example' }, switches: {} };
    const html = renderStepPage(view('dashboard', { answers }));
    expect(html).toContain('>Click here to show/hide the guide</summary>');
    expect(html).toContain('https://bot.example/api/auth/callback');
    expect(html).not.toContain('&lt;DASHBOARD_URL&gt;');
  });

  it('never prints a saved secret and tells the reader it is kept', () => {
    const answers: Answers = {
      values: {
        DISCORD_TOKEN: 'super-secret-token-value',
        DISCORD_CLIENT_ID: '123456789012345678',
      },
      switches: {},
    };
    const html = renderStepPage(view('discord', { answers }));
    expect(html).not.toContain('super-secret-token-value');
    expect(html).toContain('placeholder="Keep the current value"');
    expect(html).toContain('Leave this empty to keep the current value.');
    expect(html).toContain('value="123456789012345678"');
  });

  it('renders select options, switches and the hidden always-on switch', () => {
    const ai = renderStepPage(
      view('ai', {
        answers: { values: { DEFAULT_AI_PROVIDER: 'openai' }, switches: { 'ai-chat': true } },
      }),
    );
    expect(ai).toContain('<option value="openai" selected>OpenAI</option>');
    expect(ai).toMatch(/name="switch_ai-chat" value="on" checked/);
    expect(ai).toContain('data-field="GEMINI_API_KEY" data-cond');

    const docker = renderStepPage(view('dashboard', {}, 'docker'));
    expect(docker).toContain('name="switch_dashboard" value="on" checked');
    expect(docker).not.toContain('Enable the web dashboard');

    const source = renderStepPage(view('dashboard'));
    expect(source).toContain('Enable the web dashboard');
  });

  it('shows errors, the banner, check lines and guide links', () => {
    const html = renderStepPage(
      view('discord', {
        issues: new Map([
          [
            'DISCORD_TOKEN',
            { message: 'Bad token.', guideStep: { guide: 'discord' as const, step: 4 } },
          ],
        ]),
        checkLines: [
          {
            id: 'discord-bot',
            status: 'fail',
            message: 'Rejected.',
            guideStep: { guide: 'discord', step: 4 },
          },
        ],
      }),
    );
    expect(html).toContain('class="banner error"');
    expect(html).toContain('Bad token.');
    expect(html).toContain('Read step 4 of the');
    expect(html).toContain('<li class="check fail">');
    expect(html).toContain('<details class="guide" id="guide-discord" open>');
  });

  it('puts the file, the profile and the update mode on the welcome page', () => {
    const html = renderStepPage(view('welcome', { fileExists: true, targetFile: '/a&b/.env' }));
    expect(html).toContain('/a&amp;b/.env');
    expect(html).toContain('The file exists.');
    expect(renderStepPage(view('welcome', {}, 'docker'))).toContain('Docker');
  });

  it('renders the install page with the summary, the invite link and write errors', () => {
    const html = renderStepPage(
      view('install', {
        install: {
          summary: [{ label: 'Bot token', value: 'abc...****...xyz' }],
          inviteUrl: buildInviteUrl('123456789012345678'),
          writeErrors: ['DISCORD_TOKEN: bad <value>'],
        },
      }),
    );
    expect(html).toContain('Nothing was written.');
    expect(html).toContain('bad &lt;value&gt;');
    expect(html).toContain('abc...****...xyz');
    expect(html).toContain('client_id=123456789012345678');
    expect(html).toContain('href="/legal/terms"');
    expect(html).toContain('value="finish"');
    expect(html).toContain('Download the file');
  });

  it('renders the message, legal and result pages', () => {
    expect(renderMessagePage('Forbidden', '<x>')).toContain('&lt;x&gt;');
    expect(renderLegalPage('Terms', '# Hi')).toContain('<h1>Hi</h1>');
    const result = renderResultPage({
      profile: 'source',
      file: '/repo/.env',
      backup: '/repo/.env.bak-1',
      created: false,
      generatedKeys: ['SECRET_VAULT_KEY'],
      inviteUrl: null,
      commands: nextCommands('source', { update: true, dashboard: true }),
    });
    expect(result).toContain('was updated');
    expect(result).toContain('/repo/.env.bak-1');
    expect(result).toContain('<code>SECRET_VAULT_KEY</code>');
    expect(result).toContain('pnpm dev:web');
  });
});

describe('conditionalCss', () => {
  it('hides conditional fields and shows them for their switch and select value', () => {
    const css = conditionalCss();
    expect(css).toContain('[data-cond] { display: none; }');
    expect(css).toContain(
      '.wizard:has(input[name="switch_ai-chat"]:checked):has(select[name="DEFAULT_AI_PROVIDER"] option[value="openai"]:checked) [data-field="OPENAI_API_KEY"]',
    );
    // A field used by two switches gets a rule for each.
    expect(css).toContain(
      'switch_ai-images"]:checked):has(select[name="IMAGE_DEFAULT_PROVIDER"] option[value="gemini"]:checked) [data-field="GEMINI_API_KEY"]',
    );
    expect(css).toContain('[data-field="TWITCH_CLIENT_ID"]');
    expect(css).toContain('@supports not selector(:has(*))');
  });
});

describe('buildInviteUrl', () => {
  it('builds the exact invite link', () => {
    expect(buildInviteUrl('123456789012345678')).toBe(
      'https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot%20applications.commands&permissions=626721090433015',
    );
  });
});

describe('nextCommands', () => {
  it('lists the source commands in the order of SETUP.md, with db:reset for a new database only', () => {
    const fresh = nextCommands('source', { update: false, dashboard: false }).map((c) => c.command);
    expect(fresh).toEqual([
      'pnpm db:reset',
      'pnpm tcg:card-builder --rerender',
      'pnpm tcg:boss-builder --all',
      'pnpm lavalink:install',
      'pnpm lavalink:start',
      'pnpm dev:bot',
    ]);
    const update = nextCommands('source', { update: true, dashboard: true }).map((c) => c.command);
    expect(update).not.toContain('pnpm db:reset');
    expect(update.at(-1)).toBe('pnpm dev:web');
  });

  it('lists the docker commands of docs/deployment.md', () => {
    const commands = nextCommands('docker', { update: false, dashboard: true }).map(
      (c) => c.command,
    );
    const compose = 'docker compose -f docker-compose.production.yml --env-file .env.production';
    expect(commands).toEqual([
      `${compose} up -d`,
      `${compose} ps`,
      `${compose} logs bot`,
      `${compose} exec bot ririko commands:sync --global --all-guilds`,
    ]);
  });
});

describe('summaryRows', () => {
  it('masks secrets and marks unset values and switches', () => {
    const rows = summaryRows('source', {
      values: {
        DISCORD_CLIENT_ID: '123456789012345678',
        DISCORD_TOKEN: 'MTIzNDU2Nzg5MDEyMzQ1Njc4.Gabcde.secret-token',
        DATABASE_DIALECT: 'sqlite',
      },
      switches: { twitch: true },
    });
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));
    expect(byLabel.get('Application ID')).toBe('123456789012345678');
    expect(byLabel.get('Bot token')).toMatch(/^MTIzND\.\.\.\*\*\*\*\.\.\./);
    expect(byLabel.get('Bot token')).not.toContain('secret-token');
    expect(byLabel.get('Bot owner ID (optional)')).toBe('(not set)');
    expect(byLabel.get('Enable Twitch Stream Notifier')).toBe('On');
    expect(byLabel.get('Enable YouTube Stream Notifier')).toBe('Off');
    expect(byLabel.has('Twitch Client ID')).toBe(true);
    expect(byLabel.has('YouTube Data API key')).toBe(false);
  });
});
