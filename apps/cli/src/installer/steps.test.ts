import { describe, expect, it } from 'vitest';
import { GUIDES } from './guides.js';
import {
  PAGES,
  PAGE_IDS,
  activeChecks,
  activeFields,
  activePlacement,
  effectiveSwitches,
  fieldApplies,
  fieldRequired,
  getPage,
  nextPage,
  usesRemoteLavalink,
  validatePage,
  type Answers,
} from './steps.js';

const ID = '123456789012345678';

function answers(values: Record<string, string> = {}, switches: Answers['switches'] = {}): Answers {
  return { values, switches };
}

describe('page order', () => {
  it('has the seven pages in the fixed order', () => {
    expect(PAGE_IDS).toEqual([
      'welcome',
      'discord',
      'ai',
      'streams',
      'database',
      'dashboard',
      'install',
    ]);
    expect(PAGES.map((page) => page.title)).toEqual([
      'Welcome',
      'Discord Bot',
      'AI',
      'Stream Alerts',
      'Database & Music',
      'Dashboard',
      'Install',
    ]);
    expect(PAGES.map((page) => page.subtitle)).toEqual([
      '',
      'Step 1',
      'Step 2',
      'Step 3',
      'Step 4',
      'Step 5',
      'Step 6',
    ]);
  });

  it('walks forward with nextPage and ends on Install', () => {
    expect(nextPage('welcome')?.id).toBe('discord');
    expect(nextPage('dashboard')?.id).toBe('install');
    expect(nextPage('install')).toBeNull();
  });

  it('finds a page and rejects an unknown id', () => {
    expect(getPage('ai').title).toBe('AI');
    expect(() => getPage('nope' as never)).toThrow(/Unknown page/);
  });

  it('only names guides that exist and fields whose guide the page lists', () => {
    const known = new Set(GUIDES.map((guide) => guide.id));
    for (const page of PAGES) {
      for (const id of page.guides) expect(known.has(id)).toBe(true);
      const placed = page.blocks.flatMap((block) => block.guides.map((button) => button.guide));
      expect(new Set(placed), page.id).toEqual(new Set(page.guides));
      for (const field of page.fields) {
        if (field.guide) expect(page.guides).toContain(field.guide);
      }
    }
  });

  it('gives every field a unique name', () => {
    const names = PAGES.flatMap((page) => page.fields.map((field) => field.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('switches and applicability', () => {
  it('turns the dashboard on for docker only', () => {
    expect(effectiveSwitches('docker', {}).dashboard).toBe(true);
    expect(effectiveSwitches('source', {}).dashboard).toBe(false);
    expect(effectiveSwitches('source', { dashboard: true }).dashboard).toBe(true);
  });

  it('hides the fields of a feature that is off', () => {
    const ai = getPage('ai');
    expect(activeFields(ai, 'source', answers())).toEqual([]);
    const names = activeFields(
      ai,
      'source',
      answers({ DEFAULT_AI_PROVIDER: 'openai' }, { 'ai-chat': true }),
    ).map((field) => field.name);
    expect(names).toEqual(['DEFAULT_AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_BASE_URL']);
  });

  it('asks for the Gemini key for chat or for images', () => {
    const ai = getPage('ai');
    const gemini = ai.fields.find((field) => field.name === 'GEMINI_API_KEY')!;
    expect(
      fieldApplies(
        gemini,
        'source',
        answers({ DEFAULT_AI_PROVIDER: 'gemini' }, { 'ai-chat': true }),
      ),
    ).toBe(true);
    expect(
      fieldApplies(
        gemini,
        'source',
        answers({ IMAGE_DEFAULT_PROVIDER: 'gemini' }, { 'ai-images': true }),
      ),
    ).toBe(true);
    expect(
      fieldApplies(
        gemini,
        'source',
        answers({ DEFAULT_AI_PROVIDER: 'openai' }, { 'ai-chat': true }),
      ),
    ).toBe(false);
  });

  it('hides source-only fields for docker', () => {
    const database = getPage('database');
    // Docker has no database choice; its Lavalink choice is the bundled or a remote node.
    expect(activeFields(database, 'docker', answers()).map((field) => field.name)).toEqual([
      'LAVALINK_MODE_DOCKER',
    ]);
    expect(activeFields(database, 'source', answers()).map((field) => field.name)).toEqual([
      'DATABASE_DIALECT',
      'LAVALINK_MODE',
    ]);
  });

  it('requires the connection string only for PostgreSQL', () => {
    const url = getPage('database').fields.find((field) => field.name === 'DATABASE_URL')!;
    expect(fieldRequired(url, 'source', answers({ DATABASE_DIALECT: 'postgres' }))).toBe(true);
    expect(fieldRequired(url, 'source', answers({ DATABASE_DIALECT: 'sqlite' }))).toBe(false);
    const owner = getPage('discord').fields.find((field) => field.name === 'BOT_OWNER_ID')!;
    expect(fieldRequired(owner, 'source', answers())).toBe(false);
  });

  it('lists the required checks of the features that are on', () => {
    expect(activeChecks(getPage('discord'), 'source', answers())).toEqual(['discord-bot']);
    expect(activeChecks(getPage('ai'), 'source', answers())).toEqual([]);
    expect(
      activeChecks(getPage('ai'), 'source', answers({}, { 'ai-chat': true, 'ai-images': true })),
    ).toEqual(['ai-provider', 'image-provider']);
    expect(activeChecks(getPage('dashboard'), 'docker', answers())).toEqual(['dashboard-oauth']);
    expect(
      activeChecks(getPage('database'), 'source', answers({ DATABASE_DIALECT: 'postgres' })),
    ).toEqual(['postgres']);
  });
});

describe('validatePage', () => {
  it('reports the required Discord fields in page order', () => {
    expect(validatePage(getPage('discord'), 'source', answers())).toEqual([
      { field: 'DISCORD_CLIENT_ID', message: 'Application ID is required.' },
      { field: 'DISCORD_TOKEN', message: 'Bot token is required.' },
    ]);
  });

  it('returns the same errors for the same answers', () => {
    const input = answers({
      DISCORD_CLIENT_ID: 'abc',
      BOT_OWNER_ID: 'x',
      DISCORD_DEV_GUILD_ID: '1',
    });
    const first = validatePage(getPage('discord'), 'source', input);
    const second = validatePage(getPage('discord'), 'source', input);
    expect(second).toEqual(first);
    expect(first.map((error) => error.field)).toEqual([
      'DISCORD_CLIENT_ID',
      'DISCORD_TOKEN',
      'BOT_OWNER_ID',
      'DISCORD_DEV_GUILD_ID',
    ]);
  });

  it('accepts a valid page and trims spaces', () => {
    expect(
      validatePage(
        getPage('discord'),
        'source',
        answers({ DISCORD_CLIENT_ID: ` ${ID} `, DISCORD_TOKEN: 'token', BOT_OWNER_ID: ID }),
      ),
    ).toEqual([]);
  });

  it('uses the schema message for a bad owner list and a bad URL', () => {
    const owner = validatePage(
      getPage('discord'),
      'source',
      answers({ DISCORD_CLIENT_ID: ID, DISCORD_TOKEN: 't', BOT_OWNER_ID: 'nope' }),
    );
    expect(owner).toEqual([
      { field: 'BOT_OWNER_ID', message: 'BOT_OWNER_ID must list Discord user IDs' },
    ]);
    const ollama = validatePage(
      getPage('ai'),
      'source',
      answers({ DEFAULT_AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'not a url' }, { 'ai-chat': true }),
    );
    expect(ollama).toHaveLength(1);
    expect(ollama[0]?.field).toBe('OLLAMA_BASE_URL');
  });

  it('checks a select against its options', () => {
    const errors = validatePage(
      getPage('ai'),
      'source',
      answers({ DEFAULT_AI_PROVIDER: 'mongo' }, { 'ai-chat': true }),
    );
    expect(errors[0]?.field).toBe('DEFAULT_AI_PROVIDER');
    expect(errors[0]?.message).toContain('Google Gemini, OpenAI, Ollama');
  });

  it('requires only what the chosen provider needs', () => {
    expect(
      validatePage(
        getPage('ai'),
        'source',
        answers({ DEFAULT_AI_PROVIDER: 'gemini' }, { 'ai-chat': true }),
      ),
    ).toEqual([
      {
        field: 'GEMINI_API_KEY',
        message: 'Gemini API key (shared by chat and images) is required.',
      },
    ]);
    expect(validatePage(getPage('ai'), 'source', answers())).toEqual([]);
  });

  it('requires the stream keys of the switches that are on', () => {
    expect(
      validatePage(getPage('streams'), 'source', answers({}, { twitch: true, youtube: true })).map(
        (error) => error.field,
      ),
    ).toEqual(['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'YOUTUBE_API_KEY']);
  });

  it('checks the PostgreSQL connection string', () => {
    const base = { DATABASE_DIALECT: 'postgres' };
    expect(validatePage(getPage('database'), 'source', answers(base))).toEqual([
      { field: 'DATABASE_URL', message: 'PostgreSQL connection string is required.' },
    ]);
    expect(
      validatePage(
        getPage('database'),
        'source',
        answers({ ...base, DATABASE_URL: './x.sqlite' }),
      )[0]?.message,
    ).toContain('postgresql://');
    expect(
      validatePage(
        getPage('database'),
        'source',
        answers({ ...base, DATABASE_URL: 'postgresql://u:p@localhost:5432/ririko' }),
      ),
    ).toEqual([]);
  });

  it('asks for the dashboard fields for docker without a switch', () => {
    expect(validatePage(getPage('dashboard'), 'docker', answers()).map((e) => e.field)).toEqual([
      'DISCORD_CLIENT_SECRET',
      'DASHBOARD_URL',
    ]);
    expect(validatePage(getPage('dashboard'), 'source', answers())).toEqual([]);
    expect(
      validatePage(
        getPage('dashboard'),
        'docker',
        answers({ DISCORD_CLIENT_SECRET: 's', DASHBOARD_URL: 'dashboard' }),
      )[0]?.field,
    ).toBe('DASHBOARD_URL');
  });

  it('requires both acceptances on the Install page', () => {
    expect(validatePage(getPage('install'), 'source', answers()).map((e) => e.field)).toEqual([
      'accept_tos',
      'accept_privacypolicy',
    ]);
    expect(
      validatePage(
        getPage('install'),
        'source',
        answers({ accept_tos: 'true', accept_privacypolicy: 'true' }),
      ),
    ).toEqual([]);
  });

  it('validates the Welcome page as always valid', () => {
    expect(validatePage(getPage('welcome'), 'docker', answers())).toEqual([]);
  });
});

describe('the shared Gemini key', () => {
  const ai = getPage('ai');
  const gemini = ai.fields.find((field) => field.name === 'GEMINI_API_KEY')!;
  const chat = answers({ DEFAULT_AI_PROVIDER: 'gemini' }, { 'ai-chat': true });
  const images = answers({ IMAGE_DEFAULT_PROVIDER: 'gemini' }, { 'ai-images': true });
  const both = answers(
    { DEFAULT_AI_PROVIDER: 'gemini', IMAGE_DEFAULT_PROVIDER: 'gemini' },
    { 'ai-chat': true, 'ai-images': true },
  );

  it('is one field with a copy for chat and a copy for images', () => {
    expect(ai.fields.filter((field) => field.name.startsWith('GEMINI_API_KEY'))).toHaveLength(1);
    expect(gemini.placements?.map((placement) => placement.form)).toEqual([
      'GEMINI_API_KEY__chat',
      'GEMINI_API_KEY__images',
    ]);
    expect(gemini.label).toContain('shared by chat and images');
  });

  it('shows the chat copy for chat only, the image copy for images only, and one copy for both', () => {
    const form = (a: Answers) => activePlacement(gemini, 'source', a)?.form ?? null;
    expect(form(chat)).toBe('GEMINI_API_KEY__chat');
    expect(form(images)).toBe('GEMINI_API_KEY__images');
    expect(form(both)).toBe('GEMINI_API_KEY__chat');
    expect(form(answers())).toBeNull();
    // Chat on another provider leaves the key to the image group.
    expect(
      form(
        answers(
          { DEFAULT_AI_PROVIDER: 'openai', IMAGE_DEFAULT_PROVIDER: 'gemini' },
          { 'ai-chat': true, 'ai-images': true },
        ),
      ),
    ).toBe('GEMINI_API_KEY__images');
    // A field without placements has no copy.
    expect(activePlacement(ai.fields[0]!, 'source', chat)).toBeNull();
  });

  it('applies exactly when one of the copies is shown, and validation names the one field', () => {
    for (const a of [chat, images, both]) {
      expect(fieldApplies(gemini, 'source', a)).toBe(true);
      expect(validatePage(ai, 'source', a).map((error) => error.field)).toEqual(['GEMINI_API_KEY']);
    }
    expect(fieldApplies(gemini, 'source', answers())).toBe(false);
    expect(
      validatePage(ai, 'source', { ...both, values: { ...both.values, GEMINI_API_KEY: 'k' } }),
    ).toEqual([]);
  });
});

describe('the Lavalink choices', () => {
  const database = getPage('database');
  const names = (profile: 'source' | 'docker', values: Record<string, string>) =>
    activeFields(database, profile, answers(values)).map((field) => field.name);

  it('has one choice per profile with the documented labels and defaults', () => {
    const local = database.fields.find((field) => field.name === 'LAVALINK_MODE')!;
    expect(local.options?.map((option) => option.label)).toEqual([
      'Run Lavalink on this computer',
      'Use a Lavalink server I already have',
    ]);
    expect(local.defaults).toEqual({ source: 'local' });
    expect(local.env).toBe(false);
    const bundled = database.fields.find((field) => field.name === 'LAVALINK_MODE_DOCKER')!;
    expect(bundled.options?.map((option) => option.label)).toEqual([
      'Bundled Lavalink',
      'Remote Lavalink node',
    ]);
    expect(bundled.defaults).toEqual({ docker: 'bundled' });
  });

  it('asks for the address, port, password and connection type only for a server elsewhere', () => {
    expect(names('source', { LAVALINK_MODE: 'local' })).toEqual([
      'DATABASE_DIALECT',
      'LAVALINK_MODE',
    ]);
    expect(names('source', { LAVALINK_MODE: 'remote' })).toEqual([
      'DATABASE_DIALECT',
      'LAVALINK_MODE',
      'LAVALINK_HOST',
      'LAVALINK_PORT',
      'LAVALINK_PASSWORD',
      'LAVALINK_SECURE',
    ]);
    expect(names('docker', { LAVALINK_MODE_DOCKER: 'bundled' })).toEqual(['LAVALINK_MODE_DOCKER']);
    expect(names('docker', { LAVALINK_MODE_DOCKER: 'remote' })).toEqual([
      'LAVALINK_MODE_DOCKER',
      'LAVALINK_HOST',
      'LAVALINK_PORT',
      'LAVALINK_PASSWORD',
    ]);
  });

  it('runs the Lavalink check only for a server elsewhere', () => {
    const checks = (profile: 'source' | 'docker', values: Record<string, string>) =>
      activeChecks(database, profile, answers(values));
    expect(checks('source', { LAVALINK_MODE: 'local' })).toEqual([]);
    expect(checks('source', { LAVALINK_MODE: 'remote' })).toEqual(['lavalink']);
    expect(checks('docker', { LAVALINK_MODE_DOCKER: 'bundled' })).toEqual([]);
    expect(checks('docker', { LAVALINK_MODE_DOCKER: 'remote' })).toEqual(['lavalink']);
    expect(usesRemoteLavalink('source', answers({ LAVALINK_MODE: 'remote' }))).toBe(true);
    expect(usesRemoteLavalink('docker', answers({ LAVALINK_MODE: 'remote' }))).toBe(false);
    expect(usesRemoteLavalink('docker', answers({ LAVALINK_MODE_DOCKER: 'remote' }))).toBe(true);
  });

  it('validates the address, the port and the connection type with the config schema', () => {
    const remote = {
      LAVALINK_MODE: 'remote',
      LAVALINK_HOST: '192.0.2.10',
      LAVALINK_PORT: '2333',
      LAVALINK_PASSWORD: 'secret-value',
      LAVALINK_SECURE: 'false',
    };
    const problems = (values: Record<string, string>) =>
      validatePage(database, 'source', answers({ DATABASE_DIALECT: 'sqlite', ...values })).map(
        (error) => error.field,
      );
    expect(problems(remote)).toEqual([]);
    expect(problems({ ...remote, LAVALINK_HOST: 'http://192.0.2.10' })).toEqual(['LAVALINK_HOST']);
    expect(problems({ ...remote, LAVALINK_PORT: '70000' })).toEqual(['LAVALINK_PORT']);
    expect(problems({ ...remote, LAVALINK_PORT: 'abc' })).toEqual(['LAVALINK_PORT']);
    expect(problems({ ...remote, LAVALINK_SECURE: 'maybe' })).toEqual(['LAVALINK_SECURE']);
    expect(problems({ LAVALINK_MODE: 'remote' })).toEqual([
      'LAVALINK_HOST',
      'LAVALINK_PORT',
      'LAVALINK_PASSWORD',
      'LAVALINK_SECURE',
    ]);
  });
});
