import { DEFAULT_FOLDER } from './constants.js';

export type InstallMode = 'docker' | 'source';

export interface StarterOptions {
  folder: string;
  /** Null: ask the reader. */
  mode: InstallMode | null;
  /** The release tag to install, or null for the newest. */
  ref: string | null;
}

export type ParsedArgs =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'run'; options: StarterOptions }
  | { kind: 'error'; message: string };

/** A release tag as the starter accepts it from --ref: v2.0.0, or v2.0.0-rc.8. */
export const REF_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Reads the arguments after `npx ririko`. Never throws: a bad argument is an `error` result. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let folder: string | null = null;
  let mode: InstallMode | null = null;
  let ref: string | null = null;
  let optionsEnded = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;

    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith('-')) {
      if (arg === '--help' || arg === '-h') return { kind: 'help' };
      if (arg === '--version' || arg === '-v') return { kind: 'version' };
      if (arg === '--docker' || arg === '--source') {
        const chosen: InstallMode = arg === '--docker' ? 'docker' : 'source';
        if (mode !== null && mode !== chosen) {
          return { kind: 'error', message: 'Choose one of --docker and --source, not both.' };
        }
        mode = chosen;
        continue;
      }
      if (arg === '--ref' || arg.startsWith('--ref=')) {
        const inline = arg.startsWith('--ref=');
        const value = inline ? arg.slice('--ref='.length) : argv[++index];
        if (value === undefined || value === '') {
          return { kind: 'error', message: '--ref needs a release tag, for example --ref v2.0.0.' };
        }
        if (!REF_PATTERN.test(value)) {
          return {
            kind: 'error',
            message: `"${value}" is not a release tag. Use a tag such as v2.0.0.`,
          };
        }
        ref = value;
        continue;
      }
      return { kind: 'error', message: `Unknown option ${arg}.` };
    }

    if (folder !== null) {
      return { kind: 'error', message: `Unexpected argument "${arg}". Give one folder name.` };
    }
    folder = arg;
  }

  return { kind: 'run', options: { folder: folder ?? DEFAULT_FOLDER, mode, ref } };
}

export function helpText(version: string): string {
  return [
    `ririko ${version}: the starter for Ririko AI`,
    '',
    'Usage: npx ririko [folder] [options]',
    '',
    'It finds the newest Ririko release and sets up the Docker install or the source install',
    `in the folder (default: ${DEFAULT_FOLDER}). The folder must not exist or must be empty.`,
    '',
    'Options:',
    '  --docker       Docker install: download the compose files and run the setup wizard',
    '  --source       Source install: clone the release, install with pnpm and run the wizard',
    '  --ref <tag>    Install this release tag (for example v2.0.0) instead of the newest',
    '  -h, --help     Show this help',
    '  -v, --version  Show the version of this starter',
    '',
    'Without --docker or --source the starter asks which one you want (Docker is the default).',
    'More: https://ririko.ai/docs/deployment',
  ].join('\n');
}
