import { resolve } from 'node:path';
import { helpText, parseArgs, type InstallMode, type StarterOptions } from './args.js';
import {
  COMPOSE_FILE,
  DOCS_URL,
  ENV_FILE,
  MIN_SOURCE_NODE_MAJOR,
  SOURCE_BLOB_BASE,
  WIZARD_PORT,
} from './constants.js';
import { StarterError } from './errors.js';
import {
  composeBase,
  composeUpCommand,
  describeCommand,
  dockerChecks,
  dockerDownloads,
  settingsPath,
  sourceChecks,
  sourceCommands,
  wizardCommand,
  type Command,
  type DownloadItem,
} from './plan.js';
import { findLatestRelease, type FetchLike } from './release.js';

export type FolderState = 'missing' | 'empty' | 'not-empty' | 'not-a-folder';

/** What a child process did. `code` is null when it could not start (the tool is not installed). */
export interface RunResult {
  code: number | null;
}

export interface DownloadedFile {
  path: string;
  content: string;
}

/** Everything the starter does to the outside world, so tests can replace it. */
export interface StarterDeps {
  fetch: FetchLike;
  /** Runs a child process. `inherit` shows its output; `quiet` hides it (tool checks). */
  run(command: Command, output: 'inherit' | 'quiet'): Promise<RunResult>;
  /** Asks one question and returns the answer; an empty string when there is none. */
  ask(question: string): Promise<string>;
  /** True when a person can answer questions. */
  interactive: boolean;
  /** True when the output is a terminal (the wizard container then gets -t). */
  tty: boolean;
  /** `uid:gid` of the current user for `docker run --user`; null where there are no user ids. */
  hostUser: string | null;
  /** `process.versions.node`. */
  nodeVersion: string;
  /** The version of this starter. */
  version: string;
  cwd(): string;
  inspectFolder(path: string): FolderState;
  /** Writes the files under the folder, creating folders as needed. */
  writeFiles(folder: string, files: readonly DownloadedFile[]): void;
  fileExists(path: string): boolean;
  log(line: string): void;
  error(line: string): void;
}

const CHOICE_ATTEMPTS = 3;
const ENABLE_PNPM_HINT =
  ' Corepack may need permission to change the Node.js folder. Run the command again with that permission, or install pnpm 10 yourself and run "pnpm install" and "pnpm installer" in the new folder.';

function parseChoice(answer: string): InstallMode | null {
  const value = answer.trim().toLowerCase();
  if (value === '' || value === '1' || value === 'd' || value === 'docker') return 'docker';
  if (value === '2' || value === 's' || value === 'source') return 'source';
  return null;
}

async function chooseMode(deps: StarterDeps): Promise<InstallMode> {
  if (!deps.interactive) {
    throw new StarterError('There is no terminal to ask in. Add --docker or --source.');
  }
  deps.log('How do you want to install Ririko?');
  deps.log('  1) Docker (recommended): the bot, the dashboard and the database run in containers');
  deps.log('  2) From source: clone the code and run it with Node.js and pnpm');
  for (let attempt = 0; attempt < CHOICE_ATTEMPTS; attempt++) {
    const mode = parseChoice(await deps.ask('Choose 1 or 2 [1]: '));
    if (mode !== null) return mode;
    deps.log('Please answer 1 or 2.');
  }
  throw new StarterError('No valid choice. Run the command again, or add --docker or --source.');
}

/** True when the reader answered yes; empty means yes. Without a terminal the answer is no. */
async function confirm(deps: StarterDeps, question: string): Promise<boolean> {
  if (!deps.interactive) return false;
  const answer = (await deps.ask(`${question} [Y/n]: `)).trim().toLowerCase();
  return answer === '' || answer === 'y' || answer === 'yes';
}

async function runStep(deps: StarterDeps, command: Command, hint = ''): Promise<void> {
  deps.log(`\n==> ${command.name}`);
  deps.log(`    ${describeCommand(command)}`);
  const result = await deps.run(command, 'inherit');
  if (result.code === null) {
    throw new StarterError(
      `Step "${command.name}" could not start: ${command.command} was not found.`,
    );
  }
  if (result.code !== 0) {
    throw new StarterError(
      `Step "${command.name}" failed with exit code ${result.code}.${hint}`,
      result.code,
    );
  }
}

async function requireTool(deps: StarterDeps, check: Command, advice: string): Promise<void> {
  const result = await deps.run(check, 'quiet');
  if (result.code !== 0) {
    throw new StarterError(
      `${check.name} is not available (\`${describeCommand(check)}\` failed). ${advice}`,
    );
  }
  deps.log(`Found ${check.name}.`);
}

/** Downloads every file first and writes them only when all arrived. */
async function downloadAll(
  deps: StarterDeps,
  items: readonly DownloadItem[],
  userAgent: string,
): Promise<DownloadedFile[]> {
  const files: DownloadedFile[] = [];
  for (const item of items) {
    let status: number;
    let content = '';
    try {
      const response = await deps.fetch(item.url, { headers: { 'User-Agent': userAgent } });
      status = response.status;
      if (response.ok) content = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new StarterError(
        `Could not download ${item.path} (${reason}). Check your internet connection and run the command again.`,
      );
    }
    if (status < 200 || status >= 300) {
      throw new StarterError(
        `Could not download ${item.path} from ${item.url} (HTTP ${status}). Check that the release tag exists.`,
      );
    }
    files.push({ path: item.path, content });
  }
  return files;
}

function nodeMajor(version: string): number {
  return Number.parseInt(version.split('.')[0] ?? '', 10);
}

async function installDocker(
  deps: StarterDeps,
  folder: string,
  ref: string,
  userAgent: string,
): Promise<void> {
  const files = await downloadAll(deps, dockerDownloads(ref), userAgent);
  try {
    deps.writeFiles(folder, files);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new StarterError(`Could not write the files to ${folder} (${reason}).`);
  }
  deps.log(`Saved ${files.length} files to ${folder}:`);
  for (const file of files) deps.log(`  ${file.path}`);

  deps.log(`\nThe setup wizard opens in a container. When it prints an address that starts with`);
  deps.log(
    `http://127.0.0.1:${WIZARD_PORT}/, open that address in your browser and follow the pages.`,
  );
  await runStep(deps, wizardCommand(folder, ref, deps.tty, deps.hostUser));

  if (!deps.fileExists(settingsPath(folder))) {
    throw new StarterError(
      `The wizard did not write ${ENV_FILE} in ${folder}. If its last page said the file could not be ` +
        `written, use "Download the file" and save it as ${ENV_FILE} in that folder. Then run in ${folder}: ` +
        `docker ${[...composeBase(), 'up', '-d'].join(' ')}`,
    );
  }

  const compose = ['docker', ...composeBase()].join(' ');
  const start = await confirm(
    deps,
    `\nStart Ririko now with "${compose} up -d"? (If you chose a remote Lavalink node, answer n and use the command on the wizard's last page.)`,
  );
  if (start) await runStep(deps, composeUpCommand(folder, ref));

  deps.log('\nNext steps (run them in the folder):');
  deps.log(`  cd ${/\s/.test(folder) ? `"${folder}"` : folder}`);
  let step = 1;
  if (!start) {
    deps.log(`  ${step++}. Start Ririko:\n       ${compose} up -d`);
  }
  deps.log(
    `  ${step++}. Check the containers (after about two minutes they show healthy):\n       ${compose} ps`,
  );
  deps.log(
    `  ${step++}. Add the bot to your server with the invite link on the wizard's last page.`,
  );
  deps.log(
    `  ${step++}. Register the slash commands once:\n       ${compose} exec bot ririko commands:sync --global --all-guilds`,
  );
  deps.log(`  ${step}. Open the dashboard at the DASHBOARD_URL you gave the wizard.`);
  deps.log(`\nThe full guide: ${DOCS_URL}`);
  deps.log(
    `The compose file is ${COMPOSE_FILE}; set RIRIKO_VERSION in ${ENV_FILE} to pin the image version.`,
  );
}

async function installSource(deps: StarterDeps, folder: string, ref: string): Promise<void> {
  for (const command of sourceCommands(folder, ref)) {
    await runStep(deps, command, command.name === 'Enable pnpm' ? ENABLE_PNPM_HINT : '');
  }
  deps.log('\nThe wizard has finished. The commands to run next are on its last page.');
  deps.log(`The source guide: ${SOURCE_BLOB_BASE}/${ref}/SETUP.md`);
}

/** Runs the starter. Returns the exit code of the program. */
export async function runStarter(argv: readonly string[], deps: StarterDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.kind === 'help') {
    deps.log(helpText(deps.version));
    return 0;
  }
  if (parsed.kind === 'version') {
    deps.log(deps.version);
    return 0;
  }
  if (parsed.kind === 'error') {
    deps.error(`ririko: ${parsed.message}\n`);
    deps.error(helpText(deps.version));
    return 1;
  }

  try {
    await start(parsed.options, deps);
    return 0;
  } catch (error) {
    if (error instanceof StarterError) {
      deps.error(`\nririko: ${error.message}`);
      return error.exitCode;
    }
    const reason = error instanceof Error ? error.message : String(error);
    deps.error(`\nririko: unexpected error: ${reason}`);
    return 1;
  }
}

async function start(options: StarterOptions, deps: StarterDeps): Promise<void> {
  const folder = resolve(deps.cwd(), options.folder);
  const state = deps.inspectFolder(folder);
  if (state === 'not-a-folder' || state === 'not-empty') {
    throw new StarterError(
      `The folder ${options.folder} already exists and is not empty. Give another folder name, or empty it first.`,
    );
  }

  const mode = options.mode ?? (await chooseMode(deps));

  if (mode === 'docker') {
    const advice =
      'Install Docker Engine 23 or newer with Compose v2, then run this command again.';
    for (const check of dockerChecks()) await requireTool(deps, check, advice);
  } else {
    if (nodeMajor(deps.nodeVersion) < MIN_SOURCE_NODE_MAJOR) {
      throw new StarterError(
        `The source install needs Node.js ${MIN_SOURCE_NODE_MAJOR} or newer (this is ${deps.nodeVersion}). Upgrade Node.js, or use --docker.`,
      );
    }
    deps.log(`Found Node.js ${deps.nodeVersion}.`);
    for (const check of sourceChecks()) {
      await requireTool(deps, check, 'Install Git, then run this command again.');
    }
  }

  const userAgent = `ririko-starter/${deps.version}`;
  const ref = options.ref ?? (await findLatestRelease(deps.fetch, userAgent));
  deps.log(`Release: ${ref}`);

  if (mode === 'docker') {
    await installDocker(deps, folder, ref, userAgent);
  } else {
    await installSource(deps, folder, ref);
  }
}
