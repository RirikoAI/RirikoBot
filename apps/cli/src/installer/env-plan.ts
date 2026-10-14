import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { AppConfigSchema, ConfigurationError, WebConfigSchema, parseConfig } from '@ririko/core';
import { applyEnvUpdates, parseEnvContent } from '../utils/env-editor.js';
import {
  PAGES,
  SQLITE_DEFAULT_URL,
  activeFields,
  answerValue,
  effectiveSwitches,
  validatePage,
  type Answers,
  type Profile,
} from './steps.js';

/**
 * Turns the wizard's answers into the settings file: `.env` from `.env.example` (source) or
 * `.env.production` from `.env.production.example` (docker). Values are written in place, so the
 * example's comments and order stay; secrets are generated once and never rotated; the result is
 * checked with the core schemas before anything is written.
 */

export interface ProfileFiles {
  /** The settings file, relative to the repository root. */
  env: string;
  /** The example it starts from. */
  example: string;
}

export const PROFILE_FILES: Record<Profile, ProfileFiles> = {
  source: { env: '.env', example: '.env.example' },
  docker: { env: '.env.production', example: '.env.production.example' },
};

/** Variables the docker compose file sets itself; the wizard never writes them for docker. */
export const DOCKER_MANAGED_VARIABLES: readonly string[] = [
  'DATABASE_DIALECT',
  'DATABASE_URL',
  'LAVALINK_HOST',
  'LAVALINK_PORT',
];

/** Example values that mean "not set yet". */
const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  'your_bot_token_here',
  'your_client_id_here',
  'youshallnotpass',
  'https://dashboard.example.com',
]);

const SECTION_HEADER = '# Added by ririko setup';

const POSTGRES_URL = /^postgres(?:ql)?:\/\//;

/** Source of random values; tests inject a fixed one so the files are byte-identical. */
export interface SecretGenerator {
  /** `bytes` random bytes as lower-case hex. */
  hex(bytes: number): string;
}

export const cryptoSecretGenerator: SecretGenerator = {
  hex: (bytes) => randomBytes(bytes).toString('hex'),
};

/** A value from the file, or '' when it is unset, empty or still the example's placeholder. */
export function realValue(env: Record<string, string>, name: string): string {
  const value = (env[name] ?? '').trim();
  return PLACEHOLDER_VALUES.has(value) ? '' : value;
}

/** The file's values without the placeholders: what the wizard shows as the starting answers. */
export function prefillValues(env: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of Object.keys(env)) {
    const value = realValue(env, name);
    if (value !== '') values[name] = value;
  }
  return values;
}

export interface EnvPlan {
  /** The variables to write, in the order they are applied. */
  updates: Record<string, string>;
  /** Names of the secrets that were generated (never their values). */
  generated: string[];
}

/**
 * Plans the variables to write. A feature that is off contributes nothing; an empty answer keeps
 * what the file has; a generated secret that the file already holds is kept.
 */
export function planEnv(
  answers: Answers,
  current: Record<string, string>,
  profile: Profile,
  generate: SecretGenerator,
): EnvPlan {
  const updates: Record<string, string> = {};
  const generated: string[] = [];
  const on = effectiveSwitches(profile, answers.switches);

  for (const page of PAGES) {
    for (const field of activeFields(page, profile, answers)) {
      if (field.env === false || field.kind === 'checkbox') continue;
      if (profile === 'docker' && DOCKER_MANAGED_VARIABLES.includes(field.name)) continue;
      const value = answerValue(answers, field.name);
      if (value !== '') {
        updates[field.name] = value;
      } else if (realValue(current, field.name) !== '') {
        // The reader cleared an optional value.
        updates[field.name] = '';
      }
    }
  }

  if (profile === 'source' && answerValue(answers, 'DATABASE_DIALECT') === 'sqlite') {
    // Moving back from PostgreSQL: the old connection string would no longer be a SQLite path.
    if (POSTGRES_URL.test(realValue(current, 'DATABASE_URL'))) {
      updates.DATABASE_URL = SQLITE_DEFAULT_URL;
    }
  }

  const generateOnce = (name: string, bytes: number): void => {
    if (realValue(current, name) !== '') return;
    updates[name] = generate.hex(bytes);
    generated.push(name);
  };
  if (on.dashboard) generateOnce('SECRET_VAULT_KEY', 32);
  generateOnce('LAVALINK_PASSWORD', 16);
  if (profile === 'docker') generateOnce('POSTGRES_PASSWORD', 16);

  return { updates, generated };
}

export interface PlanError {
  variable: string;
  message: string;
}

function schemaErrors(
  schema: typeof AppConfigSchema | typeof WebConfigSchema,
  env: Record<string, string>,
): PlanError[] {
  try {
    parseConfig(schema, env);
    return [];
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    return (error.validationErrors ?? []).map((line) => {
      const split = line.indexOf(': ');
      const path = split === -1 ? line : line.slice(0, split);
      return {
        variable: path.split('.')[0] ?? path,
        message: split === -1 ? line : line.slice(split + 2),
      };
    });
  }
}

/**
 * Parses the planned file with `AppConfigSchema` and, when the dashboard is on, with
 * `WebConfigSchema`. Returns one error per invalid variable, in the order the schemas report.
 */
export function checkPlannedEnv(
  planned: Record<string, string>,
  profile: Profile,
  answers: Answers,
): PlanError[] {
  const errors = schemaErrors(AppConfigSchema, planned);
  if (effectiveSwitches(profile, answers.switches).dashboard) {
    for (const error of schemaErrors(WebConfigSchema, planned)) {
      if (!errors.some((e) => e.variable === error.variable && e.message === error.message)) {
        errors.push(error);
      }
    }
  }
  return errors;
}

export interface WriteEnvOptions {
  /** The repository (or image) root: where the example file lives. */
  root: string;
  /** The folder of the settings file. Default: `root`. */
  settingsDir?: string | undefined;
  profile: Profile;
  answers: Answers;
  generate?: SecretGenerator;
  now?: () => Date;
}

export type WriteEnvResult =
  | {
      ok: true;
      file: string;
      /** The copy of the previous file, or null when the file is new. */
      backup: string | null;
      created: boolean;
      updatedKeys: string[];
      addedKeys: string[];
      generatedKeys: string[];
    }
  | { ok: false; errors: PlanError[] };

/** `20261012T090000Z`: the UTC time as it appears in a backup name. */
export function backupStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

function restrictToOwner(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    // Some platforms and file systems have no file modes.
  }
}

export type PlannedEnvFile =
  | {
      ok: true;
      /** The settings file the plan is for. */
      target: string;
      /** True when the file already exists (update mode). */
      exists: boolean;
      /** The complete text of the file after the changes. */
      content: string;
      updatedKeys: string[];
      addedKeys: string[];
      generatedKeys: string[];
    }
  | { ok: false; errors: PlanError[] };

/**
 * Builds the text of the settings file without touching the disk. Every page is validated first,
 * then the planned file is parsed with the core schemas; on any failure there is no text. The same
 * answers and generator always give the same text.
 */
export function planEnvFile(options: WriteEnvOptions): PlannedEnvFile {
  const { root, profile, answers } = options;
  const generate = options.generate ?? cryptoSecretGenerator;
  const files = PROFILE_FILES[profile];
  const target = join(options.settingsDir ?? root, files.env);
  const exists = existsSync(target);

  const pageErrors: PlanError[] = PAGES.flatMap((page) =>
    validatePage(page, profile, answers).map((error) => ({
      variable: error.field,
      message: error.message,
    })),
  );
  if (pageErrors.length > 0) return { ok: false, errors: pageErrors };

  let base: string;
  if (exists) {
    base = readFileSync(target, 'utf-8');
  } else {
    const examplePath = join(root, files.example);
    if (!existsSync(examplePath)) {
      throw new Error(`${files.example} was not found in ${root}; it is the starting point.`);
    }
    base = readFileSync(examplePath, 'utf-8');
  }

  // A new file starts from the example, whose values are placeholders and so count as unset.
  const current = exists ? parseEnvContent(base) : {};
  const plan = planEnv(answers, current, profile, generate);
  const applied = applyEnvUpdates(base, plan.updates, SECTION_HEADER);

  const errors = checkPlannedEnv(parseEnvContent(applied.content), profile, answers);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    target,
    exists,
    content: applied.content,
    updatedKeys: applied.updatedKeys,
    addedKeys: applied.addedKeys,
    generatedKeys: plan.generated,
  };
}

/**
 * Writes the settings file ({@link planEnvFile} decides what). An existing file is copied to
 * `<file>.bak-<UTC timestamp>` before it is replaced, and the new file gets mode 0600.
 */
export function writeEnv(options: WriteEnvOptions): WriteEnvResult {
  const now = options.now ?? (() => new Date());
  const planned = planEnvFile(options);
  if (!planned.ok) return planned;

  const { target, exists } = planned;
  let backup: string | null = null;
  if (exists) {
    backup = `${target}.bak-${backupStamp(now())}`;
    copyFileSync(target, backup);
    restrictToOwner(backup);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, planned.content, { encoding: 'utf-8', mode: 0o600 });
  restrictToOwner(target);

  return {
    ok: true,
    file: target,
    backup,
    created: !exists,
    updatedKeys: planned.updatedKeys,
    addedKeys: planned.addedKeys,
    generatedKeys: planned.generatedKeys,
  };
}
