import { join } from 'node:path';
import {
  CLONE_URL,
  COMPOSE_FILE,
  DOCKER_FILES,
  DOCKER_IMAGE,
  ENV_FILE,
  RAW_BASE,
  WIZARD_PORT,
} from './constants.js';
import { imageTag } from './release.js';

/** One child process the starter runs. The name is what the reader sees when it fails. */
export interface Command {
  name: string;
  command: string;
  args: string[];
  /** Working folder; the folder the reader started in when omitted. */
  cwd?: string;
  /** Extra environment variables for this process only. */
  env?: Record<string, string>;
}

export interface DownloadItem {
  /** Path inside the repository and inside the install folder. */
  path: string;
  url: string;
}

/** The tools the Docker install needs. */
export function dockerChecks(): Command[] {
  return [
    { name: 'Docker', command: 'docker', args: ['--version'] },
    { name: 'Docker Compose', command: 'docker', args: ['compose', 'version'] },
  ];
}

/** The tools the source install needs besides Node.js. */
export function sourceChecks(): Command[] {
  return [{ name: 'Git', command: 'git', args: ['--version'] }];
}

/** The files of the release that docker-compose.production.yml needs to start. */
export function dockerDownloads(ref: string): DownloadItem[] {
  return DOCKER_FILES.map((path) => ({ path, url: `${RAW_BASE}/${ref}/${path}` }));
}

/**
 * The setup wizard in a short-lived container (docs/deployment.md section 2.4). The port is
 * published to 127.0.0.1 only. `hostUser` is `uid:gid` of the person running the starter (null on
 * Windows). The folder is mounted at /setup, where the wizard writes
 * .env.production.
 */
export function wizardCommand(
  folder: string,
  ref: string,
  tty: boolean,
  hostUser: string | null = null,
): Command {
  return {
    name: 'Setup wizard',
    command: 'docker',
    args: [
      'run',
      '--rm',
      // The image runs as user 10001, which cannot write the host user's folder. Running as the
      // host user lets the wizard write .env.production there, owned by that user, so the
      // host user's `docker compose` reads it. Windows has no user ids; Docker Desktop handles it.
      ...(hostUser === null ? [] : ['--user', hostUser]),
      tty ? '-it' : '-i',
      '-p',
      `127.0.0.1:${WIZARD_PORT}:${WIZARD_PORT}`,
      '-v',
      `${folder}:/setup`,
      `${DOCKER_IMAGE}:${imageTag(ref)}`,
      'ririko',
      'setup',
      '--docker',
      '--env-file',
      `/setup/${ENV_FILE}`,
      '--listen',
      '0.0.0.0',
      '--no-open',
    ],
  };
}

/** The compose arguments every later command repeats. */
export function composeBase(): string[] {
  return ['compose', '-f', COMPOSE_FILE, '--env-file', ENV_FILE];
}

/** Starts the stack (docs/deployment.md section 2.5), on the image version of the release. */
export function composeUpCommand(folder: string, ref: string): Command {
  return {
    name: 'Start the stack',
    command: 'docker',
    args: [...composeBase(), 'up', '-d'],
    cwd: folder,
    env: { RIRIKO_VERSION: imageTag(ref) },
  };
}

/** The commands of the source install: clone the release, pnpm through corepack, the wizard. */
export function sourceCommands(folder: string, ref: string): Command[] {
  return [
    {
      name: 'Download the release',
      command: 'git',
      args: ['clone', '--branch', ref, '--depth', '1', CLONE_URL, folder],
    },
    { name: 'Enable pnpm', command: 'corepack', args: ['enable', 'pnpm'], cwd: folder },
    { name: 'Install the dependencies', command: 'pnpm', args: ['install'], cwd: folder },
    { name: 'Setup wizard', command: 'pnpm', args: ['installer'], cwd: folder },
  ];
}

/** A command as one line for the reader. */
export function describeCommand(command: Command): string {
  return [command.command, ...command.args].join(' ');
}

/** Where the wizard writes the settings file of the Docker install. */
export function settingsPath(folder: string): string {
  return join(folder, ENV_FILE);
}
