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
    expect(renderStepPage(view('discord'))).toContain('Click here to show/hide the guide: ');
    const html = renderStepPage(view('streams'));
    expect(html).toContain('>Click here to show/hide the guide</summary>');
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
    expect(css).toContain('[data-cond],\n[data-gate] { display: none; }');
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

describe('order of the 1.x installer', () => {
  const profileOf = (id: PageId): Profile => (id === 'dashboard' ? 'docker' : 'source');
  const html = (id: PageId) => renderStepPage(view(id, {}, profileOf(id)));
  const at = (page: string, needle: string): number => {
    const index = page.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };

  it('puts the heading and the intro before the fields, and the note and guides after them', () => {
    for (const page of PAGES) {
      if (page.blocks.length === 0) continue;
      const out = html(page.id);
      const heading = at(out, 'class="section-heading"');
      const firstField = at(out, 'data-field="');
      const lastField = out.lastIndexOf('data-field="');
      const firstNote = at(out, 'class="note');
      expect(heading, page.id).toBeLessThan(firstField);
      // No note or guide button sits above the fields.
      expect(firstNote, page.id).toBeGreaterThan(firstField);
      expect(out.indexOf('<details'), page.id).toBeGreaterThan(firstField);
      // The last note follows the last field.
      expect(out.lastIndexOf('class="note'), page.id).toBeGreaterThan(lastField);
    }
  });

  it('places each note after the fields of its group and its guide buttons at the end of the note', () => {
    for (const page of PAGES) {
      page.blocks.forEach((block, index) => {
        const out = html(page.id);
        const gate = block.when ? `data-gate="${page.id}-note-${index}"` : 'class="note"';
        const start = at(out, gate);
        if (block.after !== undefined) {
          expect(at(out, `data-field="${block.after}"`), block.after).toBeLessThan(start);
        }
        const note = at(out, `<b>Note:</b><br>1. `);
        expect(note).toBeGreaterThan(-1);
        for (const [i, button] of block.guides.entries()) {
          const key = button.when ? `data-gate="${page.id}-note-${index}-guide-${i}"` : null;
          const guide = at(
            out.slice(start),
            key ?? `<details class="guide" id="guide-${button.guide}`,
          );
          const noteEnd = out.indexOf('</p>', start);
          expect(start + guide).toBeGreaterThan(noteEnd);
        }
      });
    }
  });

  it('puts a switch before its fields and the note of the group after them', () => {
    const out = html('ai');
    const chat = at(out, 'name="switch_ai-chat"');
    const provider = at(out, 'data-field="DEFAULT_AI_PROVIDER"');
    const ollama = at(out, 'data-field="OLLAMA_BASE_URL"');
    const chatNote = at(out, 'data-gate="ai-note-0"');
    const images = at(out, 'name="switch_ai-images"');
    const imageProvider = at(out, 'data-field="IMAGE_DEFAULT_PROVIDER"');
    const imagesNote = at(out, 'data-gate="ai-note-1"');
    expect(chat).toBeLessThan(provider);
    expect(ollama).toBeLessThan(chatNote);
    expect(chatNote).toBeLessThan(images);
    expect(images).toBeLessThan(imageProvider);
    expect(imageProvider).toBeLessThan(imagesNote);
  });

  it('keeps every switch-gated guide button inside its gated block and hides it by CSS', () => {
    const css = conditionalCss();
    const ai = html('ai');
    const block = at(ai, 'data-gate="ai-note-0"');
    const openai = at(ai, 'data-gate="ai-note-0-guide-1"');
    expect(openai).toBeGreaterThan(block);
    expect(openai).toBeLessThan(at(ai, 'data-gate="ai-note-1"'));
    expect(ai.slice(openai, openai + 120)).toContain('<details class="guide" id="guide-openai"');
    // The OpenAI guide shows only for the chat switch and the OpenAI choice, the block for the switch.
    expect(css).toContain(
      '.wizard:has(input[name="switch_ai-chat"]:checked):has(select[name="DEFAULT_AI_PROVIDER"] option[value="openai"]:checked) [data-gate="ai-note-0-guide-1"]',
    );
    expect(css).toContain(
      '.wizard:has(input[name="switch_ai-chat"]:checked) [data-gate="ai-note-0"]',
    );
    // The PostgreSQL guide shows only for the PostgreSQL choice; the Twitch guide for its switch.
    expect(css).toContain(
      '.wizard:has(select[name="DATABASE_DIALECT"] option[value="postgres"]:checked) [data-gate="database-note-0-guide-0"]',
    );
    expect(css).toContain(
      '.wizard:has(input[name="switch_twitch"]:checked) [data-gate="streams-note-0"]',
    );
    const streams = html('streams');
    expect(at(streams, 'data-gate="streams-note-0"')).toBeLessThan(
      at(streams, 'id="guide-twitch"'),
    );
    expect(at(streams, 'id="guide-twitch"')).toBeLessThan(
      at(streams, 'data-gate="streams-note-1"'),
    );
    // A guide shown for two features is on the page twice with its own ids.
    expect(ai).toContain('id="guide-gemini"');
    expect(ai).toContain('id="guide-gemini-2"');
    expect(ai).toContain('id="guide-gemini-2-step-1"');
  });

  it('shows the Discord guides after the fields without a gate, and no description boxes', () => {
    const out = html('discord');
    expect(out).not.toContain('data-gate=');
    expect(at(out, 'data-field="DISCORD_DEV_GUILD_ID"')).toBeLessThan(at(out, 'class="note"'));
    expect(html('ai')).not.toContain('class="feature"');
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
