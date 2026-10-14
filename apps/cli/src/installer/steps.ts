import {
  AppConfigSchema,
  ConfigurationError,
  DEFAULT_DATABASE_URL,
  WebConfigSchema,
  parseConfig,
} from '@ririko/core';
import type { GuideId } from './guides.js';

/**
 * The setup wizard as data: seven pages in a fixed order, their fields, rules, guides and
 * required checks. Rendering code (TASK-1924) holds no order or rules of its own.
 */

export type Profile = 'source' | 'docker';

export type SwitchId = 'ai-chat' | 'ai-images' | 'twitch' | 'youtube' | 'spotify' | 'dashboard';

export type PageId =
  'welcome' | 'discord' | 'ai' | 'streams' | 'database' | 'dashboard' | 'install';

export type FieldKind = 'text' | 'secret' | 'url' | 'select' | 'checkbox';

/** A check on a page that must pass for the current values before Next (TASK-1922 runs them). */
export type CheckId =
  | 'discord-bot'
  | 'ai-provider'
  | 'image-provider'
  | 'twitch'
  | 'youtube'
  | 'spotify'
  | 'postgres'
  | 'dashboard-oauth';

/** True when the named switch is on, the named field has the value, or both when both are given. */
export interface Condition {
  switch?: SwitchId;
  field?: string;
  equals?: string;
}

/** A rule that the schemas do not state. */
export type ExtraRule = 'snowflake' | 'postgres-url';

/**
 * Where a field's rule comes from: the variable in `AppConfigSchema` or `WebConfigSchema`, plus
 * an optional extra rule the schema does not state.
 */
export interface FieldRule {
  schema: 'app' | 'web' | 'none';
  extra?: ExtraRule;
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface Field {
  /** The environment variable, or the answer name when `env` is false. */
  name: string;
  label: string;
  placeholder: string;
  kind: FieldKind;
  options?: FieldOption[];
  /** Required whenever the field applies. */
  required: boolean;
  /** Required only while one of these conditions holds (for fields that are not `required`). */
  requiredWhen?: Condition[];
  /** The field applies while the switch is on; with several, while any applies. */
  switch?: SwitchId;
  /** The field applies only while one of these conditions holds. */
  appliesWhen?: Condition[];
  /** Profiles that show the field; all when omitted. */
  profiles?: Profile[];
  /** Value the form starts with, by profile. */
  defaults?: Partial<Record<Profile, string>>;
  rule: FieldRule;
  /** The guide that explains where the value comes from. */
  guide?: GuideId;
  /** False for answers that are not written to the file (the terms checkboxes). */
  env?: false;
}

export interface SwitchDef {
  id: SwitchId;
  label: string;
  description: string;
  /** Profiles in which the switch is always on and not shown. */
  alwaysOn?: Profile[];
  /** Profiles that show the switch; all when omitted. */
  profiles?: Profile[];
}

export interface PageCheck {
  id: CheckId;
  /** The check runs only while one of these holds; always when omitted. */
  appliesWhen?: Condition[];
}

export interface Page {
  id: PageId;
  /** Material Design Icons name, as in 1.x. */
  icon: string;
  title: string;
  subtitle: string;
  heading: string;
  intro: string[];
  /** Numbered points of the Note box. */
  note: string[];
  switches: SwitchDef[];
  fields: Field[];
  guides: GuideId[];
  checks: PageCheck[];
}

export interface Answers {
  values: Record<string, string>;
  switches: Partial<Record<SwitchId, boolean>>;
}

export interface FieldError {
  field: string;
  message: string;
}

const NO_SWITCH_NOTE = 'Leave a feature off and none of its settings are touched.';

export const PAGES: readonly Page[] = [
  {
    id: 'welcome',
    icon: 'hand-wave',
    title: 'Welcome',
    subtitle: '',
    heading: 'Welcome',
    intro: [
      'Hey! Thank you for choosing Ririko Ai as your Discord server companion.',
      'During the setup, you may need to sign up for several things important for the AI, Twitch, Moderations, Giveaways etc (but of course you can opt out from using some of them).',
      "Don't fret though! This installation is guided, and easy. Let's begin, shall we?",
    ],
    note: [],
    switches: [],
    fields: [],
    guides: [],
    checks: [],
  },
  {
    id: 'discord',
    icon: 'wrench',
    title: 'Discord Bot',
    subtitle: 'Step 1',
    heading: 'Enter your Bot details',
    intro: [],
    note: [
      "If you're not sure where to get the Application ID and Bot Token, click the button below.",
      "Please make sure that your bot has the Server Members and Message Content Privileged Gateway Intents checked. If you don't know what this is, please follow the instructions below (check step 5).",
    ],
    switches: [],
    fields: [
      {
        name: 'DISCORD_CLIENT_ID',
        label: 'Application ID',
        placeholder: 'Enter your Application ID here',
        kind: 'text',
        required: true,
        rule: { schema: 'app', extra: 'snowflake' },
        guide: 'discord',
      },
      {
        name: 'DISCORD_TOKEN',
        label: 'Bot token',
        placeholder: 'Enter your bot token here',
        kind: 'secret',
        required: true,
        rule: { schema: 'app' },
        guide: 'discord',
      },
      {
        name: 'BOT_OWNER_ID',
        label: 'Bot owner ID (optional)',
        placeholder: 'Your Discord user ID',
        kind: 'text',
        required: false,
        rule: { schema: 'app' },
        guide: 'owner-id',
      },
      {
        name: 'DISCORD_DEV_GUILD_ID',
        label: 'Test server ID (optional)',
        placeholder: 'Register commands in this server only',
        kind: 'text',
        required: false,
        profiles: ['source'],
        rule: { schema: 'app', extra: 'snowflake' },
      },
    ],
    guides: ['discord', 'owner-id'],
    checks: [{ id: 'discord-bot' }],
  },
  {
    id: 'ai',
    icon: 'robot-excited',
    title: 'AI',
    subtitle: 'Step 2',
    heading: 'Configure AI Chatbot and Image Generation',
    intro: [
      'If you want to make your community feel alive (and smarter) with an AI Chatbot, you can enable it in this page. Also if you want to enable artwork generations using AI, you can enable image generation in here too.',
    ],
    note: [
      'To enable the chatbot, we will use Google Gemini, OpenAI (not free) or your own Ollama server.',
      "To enable the features, we will need the API token / key or the server address. If you're unsure where to find them, click on the button below.",
      NO_SWITCH_NOTE,
    ],
    switches: [
      {
        id: 'ai-chat',
        label: 'Enable AI Chatbot',
        description: 'Answers in chat with Gemini, OpenAI or Ollama.',
      },
      {
        id: 'ai-images',
        label: 'Enable image generation',
        description: 'The /imagine command, with Gemini, Replicate or ComfyUI.',
      },
    ],
    fields: [
      {
        name: 'DEFAULT_AI_PROVIDER',
        label: 'AI Provider',
        placeholder: '',
        kind: 'select',
        options: [
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'ollama', label: 'Ollama' },
        ],
        required: true,
        switch: 'ai-chat',
        defaults: { source: 'gemini', docker: 'gemini' },
        rule: { schema: 'app' },
      },
      {
        name: 'GEMINI_API_KEY',
        label: 'Gemini API key',
        placeholder: 'Enter your Gemini API key here',
        kind: 'secret',
        required: true,
        appliesWhen: [
          { switch: 'ai-chat', field: 'DEFAULT_AI_PROVIDER', equals: 'gemini' },
          { switch: 'ai-images', field: 'IMAGE_DEFAULT_PROVIDER', equals: 'gemini' },
        ],
        rule: { schema: 'app' },
        guide: 'gemini',
      },
      {
        name: 'OPENAI_API_KEY',
        label: 'OpenAI API key',
        placeholder: 'Enter your OpenAI API key here',
        kind: 'secret',
        required: true,
        appliesWhen: [{ switch: 'ai-chat', field: 'DEFAULT_AI_PROVIDER', equals: 'openai' }],
        rule: { schema: 'app' },
        guide: 'openai',
      },
      {
        name: 'OPENAI_BASE_URL',
        label: 'OpenAI base URL (optional)',
        placeholder: 'https://openrouter.ai/api/v1',
        kind: 'url',
        required: false,
        appliesWhen: [{ switch: 'ai-chat', field: 'DEFAULT_AI_PROVIDER', equals: 'openai' }],
        rule: { schema: 'app' },
        guide: 'openai',
      },
      {
        name: 'OLLAMA_BASE_URL',
        label: 'Ollama address',
        placeholder: 'http://localhost:11434',
        kind: 'url',
        required: true,
        appliesWhen: [{ switch: 'ai-chat', field: 'DEFAULT_AI_PROVIDER', equals: 'ollama' }],
        defaults: { source: 'http://localhost:11434' },
        rule: { schema: 'app' },
        guide: 'ollama',
      },
      {
        name: 'IMAGE_DEFAULT_PROVIDER',
        label: 'Image provider',
        placeholder: '',
        kind: 'select',
        options: [
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'replicate', label: 'Replicate' },
          { value: 'comfyui', label: 'ComfyUI / Stable Diffusion WebUI' },
        ],
        required: true,
        switch: 'ai-images',
        defaults: { source: 'gemini', docker: 'gemini' },
        rule: { schema: 'app' },
      },
      {
        name: 'REPLICATE_API_TOKEN',
        label: 'Replicate token',
        placeholder: 'Enter your Replicate token here',
        kind: 'secret',
        required: true,
        appliesWhen: [
          { switch: 'ai-images', field: 'IMAGE_DEFAULT_PROVIDER', equals: 'replicate' },
        ],
        rule: { schema: 'app' },
        guide: 'replicate',
      },
      {
        name: 'COMFYUI_URL',
        label: 'ComfyUI address',
        placeholder: 'http://127.0.0.1:7860',
        kind: 'url',
        required: true,
        appliesWhen: [{ switch: 'ai-images', field: 'IMAGE_DEFAULT_PROVIDER', equals: 'comfyui' }],
        rule: { schema: 'app' },
        guide: 'comfyui',
      },
    ],
    guides: ['gemini', 'openai', 'ollama', 'replicate', 'comfyui'],
    checks: [
      { id: 'ai-provider', appliesWhen: [{ switch: 'ai-chat' }] },
      { id: 'image-provider', appliesWhen: [{ switch: 'ai-images' }] },
    ],
  },
  {
    id: 'streams',
    icon: 'twitch',
    title: 'Stream Alerts',
    subtitle: 'Step 3',
    heading: 'Configure Stream Alerts',
    intro: ['Get notified when a Twitch Streamer or a YouTube channel started streaming.'],
    note: [
      "To get notified when a Twitch Streamer goes live, you'll need a Twitch developer account. YouTube needs a Google Cloud API key.",
      "If you don't have one, click on the button below for guide on how to register and get the API key.",
      NO_SWITCH_NOTE,
    ],
    switches: [
      {
        id: 'twitch',
        label: 'Enable Twitch Stream Notifier',
        description: 'Announces when a Twitch streamer goes live.',
      },
      {
        id: 'youtube',
        label: 'Enable YouTube Stream Notifier',
        description: 'Announces YouTube live streams.',
      },
    ],
    fields: [
      {
        name: 'TWITCH_CLIENT_ID',
        label: 'Twitch Client ID',
        placeholder: 'Enter your Twitch Client ID here',
        kind: 'text',
        required: true,
        switch: 'twitch',
        rule: { schema: 'app' },
        guide: 'twitch',
      },
      {
        name: 'TWITCH_CLIENT_SECRET',
        label: 'Twitch Client Secret',
        placeholder: 'Enter your Twitch Client Secret here',
        kind: 'secret',
        required: true,
        switch: 'twitch',
        rule: { schema: 'app' },
        guide: 'twitch',
      },
      {
        name: 'YOUTUBE_API_KEY',
        label: 'YouTube Data API key',
        placeholder: 'Enter your YouTube Data API key here',
        kind: 'secret',
        required: true,
        switch: 'youtube',
        rule: { schema: 'app' },
        guide: 'youtube',
      },
    ],
    guides: ['twitch', 'youtube'],
    checks: [
      { id: 'twitch', appliesWhen: [{ switch: 'twitch' }] },
      { id: 'youtube', appliesWhen: [{ switch: 'youtube' }] },
    ],
  },
  {
    id: 'database',
    icon: 'database-check',
    title: 'Database & Music',
    subtitle: 'Step 4',
    heading: 'Enter your Database and Music settings',
    intro: [],
    note: [
      'Ririko stores its data in SQLite (one file, nothing to set up) or in PostgreSQL. With Docker, a PostgreSQL database comes with the stack and its password is generated for you.',
      'The password that Ririko and Lavalink (the music server) share is generated for you.',
      'Spotify links need a Spotify client; leave it off to play only from other sources.',
    ],
    switches: [
      {
        id: 'spotify',
        label: 'Enable Spotify links',
        description: 'Plays and searches Spotify tracks, albums and playlists.',
      },
    ],
    fields: [
      {
        name: 'DATABASE_DIALECT',
        label: 'Database',
        placeholder: '',
        kind: 'select',
        options: [
          { value: 'sqlite', label: 'SQLite (a file on this computer)' },
          { value: 'postgres', label: 'PostgreSQL' },
        ],
        required: true,
        profiles: ['source'],
        defaults: { source: 'sqlite' },
        rule: { schema: 'app' },
      },
      {
        name: 'DATABASE_URL',
        label: 'PostgreSQL connection string',
        placeholder: 'postgresql://user:password@localhost:5432/ririko',
        kind: 'secret',
        required: false,
        requiredWhen: [{ field: 'DATABASE_DIALECT', equals: 'postgres' }],
        appliesWhen: [{ field: 'DATABASE_DIALECT', equals: 'postgres' }],
        profiles: ['source'],
        rule: { schema: 'app', extra: 'postgres-url' },
        guide: 'postgres',
      },
      {
        name: 'SPOTIFY_CLIENT_ID',
        label: 'Spotify Client ID',
        placeholder: 'Enter your Spotify Client ID here',
        kind: 'text',
        required: true,
        switch: 'spotify',
        rule: { schema: 'app' },
        guide: 'spotify',
      },
      {
        name: 'SPOTIFY_CLIENT_SECRET',
        label: 'Spotify Client Secret',
        placeholder: 'Enter your Spotify Client Secret here',
        kind: 'secret',
        required: true,
        switch: 'spotify',
        rule: { schema: 'app' },
        guide: 'spotify',
      },
    ],
    guides: ['postgres', 'spotify'],
    checks: [
      {
        id: 'postgres',
        appliesWhen: [{ field: 'DATABASE_DIALECT', equals: 'postgres' }],
      },
      { id: 'spotify', appliesWhen: [{ switch: 'spotify' }] },
    ],
  },
  {
    id: 'dashboard',
    icon: 'view-dashboard',
    title: 'Dashboard',
    subtitle: 'Step 5',
    heading: 'Configure the web dashboard',
    intro: [
      'The dashboard lets server admins manage Ririko in a browser. Members sign in with Discord.',
    ],
    note: [
      'The dashboard needs the OAuth2 client secret of your Discord application and the address it will be reachable at.',
      'The key that encrypts stored credentials is generated for you and never replaced once it is in the file.',
      'With Docker the dashboard is always part of the stack.',
    ],
    switches: [
      {
        id: 'dashboard',
        label: 'Enable the web dashboard',
        description: 'A Next.js site for server admins.',
        alwaysOn: ['docker'],
      },
    ],
    fields: [
      {
        name: 'DISCORD_CLIENT_SECRET',
        label: 'OAuth2 client secret',
        placeholder: 'Enter your OAuth2 client secret here',
        kind: 'secret',
        required: true,
        switch: 'dashboard',
        rule: { schema: 'web' },
        guide: 'dashboard-oauth',
      },
      {
        name: 'DASHBOARD_URL',
        label: 'Dashboard address',
        placeholder: 'https://dashboard.example.com',
        kind: 'url',
        required: true,
        switch: 'dashboard',
        defaults: { source: 'http://localhost:3000' },
        rule: { schema: 'web' },
        guide: 'dashboard-oauth',
      },
    ],
    guides: ['dashboard-oauth'],
    checks: [{ id: 'dashboard-oauth', appliesWhen: [{ switch: 'dashboard' }] }],
  },
  {
    id: 'install',
    icon: 'play-circle-outline',
    title: 'Install',
    subtitle: 'Step 6',
    heading: 'Invite the bot to your Discord server',
    intro: [
      'Review your answers, accept the terms, and write the settings file. Then invite the bot to your Discord server.',
    ],
    note: [],
    switches: [],
    fields: [
      {
        name: 'accept_tos',
        label:
          'I hereby declare that I had read all the terms and conditions. By installing or using this software, I agree to the terms and conditions.',
        placeholder: '',
        kind: 'checkbox',
        required: true,
        env: false,
        rule: { schema: 'none' },
      },
      {
        name: 'accept_privacypolicy',
        label:
          'I have read and fully understood the privacy policy. By installing or using this software, I agree to the privacy policy.',
        placeholder: '',
        kind: 'checkbox',
        required: true,
        env: false,
        rule: { schema: 'none' },
      },
    ],
    guides: [],
    checks: [],
  },
];

export const PAGE_IDS: readonly PageId[] = PAGES.map((page) => page.id);

/** The page with this id. */
export function getPage(id: PageId): Page {
  const page = PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown page: ${id}`);
  return page;
}

/** The page after this one, or null on the last page. */
export function nextPage(id: PageId): Page | null {
  return PAGES[PAGES.findIndex((page) => page.id === id) + 1] ?? null;
}

/** The switches that are on, with the profile's always-on switches added. */
export function effectiveSwitches(
  profile: Profile,
  switches: Answers['switches'],
): Record<SwitchId, boolean> {
  const result: Record<SwitchId, boolean> = {
    'ai-chat': false,
    'ai-images': false,
    twitch: false,
    youtube: false,
    spotify: false,
    dashboard: false,
  };
  for (const page of PAGES) {
    for (const def of page.switches) {
      result[def.id] = def.alwaysOn?.includes(profile) === true || switches[def.id] === true;
    }
  }
  return result;
}

function holds(condition: Condition, answers: Answers, on: Record<SwitchId, boolean>): boolean {
  if (condition.switch && !on[condition.switch]) return false;
  if (condition.field !== undefined) {
    return (answers.values[condition.field] ?? '') === (condition.equals ?? '');
  }
  return true;
}

/** True while at least one of the conditions holds. */
export function anyHolds(
  conditions: readonly Condition[],
  answers: Answers,
  on: Record<SwitchId, boolean>,
): boolean {
  return conditions.some((condition) => holds(condition, answers, on));
}

/** True when the field is shown and used for these answers. */
export function fieldApplies(field: Field, profile: Profile, answers: Answers): boolean {
  if (field.profiles && !field.profiles.includes(profile)) return false;
  const on = effectiveSwitches(profile, answers.switches);
  if (field.switch && !on[field.switch]) return false;
  if (field.appliesWhen && !anyHolds(field.appliesWhen, answers, on)) return false;
  return true;
}

/** True when an applicable field must have a value. */
export function fieldRequired(field: Field, profile: Profile, answers: Answers): boolean {
  if (field.required) return true;
  if (!field.requiredWhen) return false;
  return anyHolds(field.requiredWhen, answers, effectiveSwitches(profile, answers.switches));
}

/** The fields of a page that apply to these answers, in page order. */
export function activeFields(page: Page, profile: Profile, answers: Answers): Field[] {
  return page.fields.filter((field) => fieldApplies(field, profile, answers));
}

/** The checks of a page that apply to these answers, in page order. */
export function activeChecks(page: Page, profile: Profile, answers: Answers): CheckId[] {
  const on = effectiveSwitches(profile, answers.switches);
  return page.checks
    .filter((check) => !check.appliesWhen || anyHolds(check.appliesWhen, answers, on))
    .map((check) => check.id);
}

const SNOWFLAKE = /^\d{17,20}$/;
const POSTGRES_URL = /^postgres(?:ql)?:\/\/\S+$/;

/** A valid environment for the schemas, so a probe fails only on the variable under test. */
const PROBE_BASE: Record<string, string> = {
  DISCORD_TOKEN: 'probe',
  DISCORD_CLIENT_ID: 'probe',
  DISCORD_CLIENT_SECRET: 'probe',
  DASHBOARD_URL: 'http://localhost:3000',
  SECRET_VAULT_KEY: '0'.repeat(64),
};

/** The schema's message for the variable when it holds `value`, or null when the value passes. */
function schemaProblem(name: string, value: string, schema: 'app' | 'web'): string | null {
  try {
    parseConfig(schema === 'web' ? WebConfigSchema : AppConfigSchema, {
      ...PROBE_BASE,
      [name]: value,
    });
    return null;
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    // Lines look like "NAME: message" or, for a list item, "NAME.0: message".
    const own = (error.validationErrors ?? []).find(
      (line) => line.startsWith(`${name}: `) || line.startsWith(`${name}.`),
    );
    return own ? own.slice(own.indexOf(': ') + 2) : null;
  }
}

function fieldProblem(field: Field, value: string): string | null {
  if (field.kind === 'select' && !field.options?.some((option) => option.value === value)) {
    return `${field.label} must be one of: ${(field.options ?? []).map((o) => o.label).join(', ')}.`;
  }
  if (field.rule.schema !== 'none') {
    const problem = schemaProblem(field.name, value, field.rule.schema);
    if (problem) return problem;
  }
  if (field.rule.extra === 'snowflake' && !SNOWFLAKE.test(value)) {
    return `${field.label} must be a Discord ID: 17 to 20 digits.`;
  }
  if (field.rule.extra === 'postgres-url' && !POSTGRES_URL.test(value)) {
    return `${field.label} must start with postgresql:// or postgres://.`;
  }
  return null;
}

/** The value of an answer with surrounding spaces removed; checkboxes are 'true' or ''. */
export function answerValue(answers: Answers, name: string): string {
  return (answers.values[name] ?? '').trim();
}

/**
 * Validates one page. The same answers always give the same errors in the same order: page field
 * order, a missing value first, then the schema's message, then the extra rule.
 */
export function validatePage(page: Page, profile: Profile, answers: Answers): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of activeFields(page, profile, answers)) {
    const value = answerValue(answers, field.name);
    if (field.kind === 'checkbox') {
      if (fieldRequired(field, profile, answers) && value !== 'true') {
        errors.push({ field: field.name, message: 'You need to accept this to continue.' });
      }
      continue;
    }
    if (value === '') {
      if (fieldRequired(field, profile, answers)) {
        errors.push({ field: field.name, message: `${field.label} is required.` });
      }
      continue;
    }
    const problem = fieldProblem(field, value);
    if (problem) errors.push({ field: field.name, message: problem });
  }
  return errors;
}

/** The value of `DATABASE_URL` when SQLite is chosen and nothing is typed. */
export const SQLITE_DEFAULT_URL = DEFAULT_DATABASE_URL;
