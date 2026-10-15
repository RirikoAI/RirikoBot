import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ValidationError } from '@ririko/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  DEFAULT_INSTALLER_HOST,
  DEFAULT_INSTALLER_PORT,
  startInstallerServer,
  type InstallerServer,
  type InstallerServerOptions,
} from '../installer/server.js';
import { PROFILE_FILES } from '../installer/env-plan.js';
import type { Profile } from '../installer/steps.js';

export interface SetupOptions {
  docker?: boolean | undefined;
  envFile?: string | undefined;
  port?: string | undefined;
  listen?: string | undefined;
  /** `--no-open` sets this to false. */
  open?: boolean | undefined;
}

export interface SetupDeps {
  start?: ((options: InstallerServerOptions) => Promise<InstallerServer>) | undefined;
  openBrowser?: ((url: string) => void) | undefined;
  log?: ((line: string) => void) | undefined;
  warn?: ((line: string) => void) | undefined;
  cwd?: (() => string) | undefined;
}

const LOOPBACK_LISTEN = ['127.0.0.1', 'localhost', '::1', '[::1]'];

export function isLoopbackListen(host: string): boolean {
  return LOOPBACK_LISTEN.includes(host.trim().toLowerCase());
}

/** The profile and the settings file: `--env-file`, else the profile's file in the current folder. */
export function resolveSetupTarget(
  options: SetupOptions,
  cwd: string,
): { profile: Profile; envFile: string } {
  const profile: Profile = options.docker ? 'docker' : 'source';
  const envFile = resolve(cwd, options.envFile ?? PROFILE_FILES[profile].env);
  return { profile, envFile };
}

export function parseSetupPort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_INSTALLER_PORT;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new ValidationError(`Invalid --port "${value}".`, {
      validationErrors: ['The port must be a whole number from 1 to 65535.'],
    });
  }
  return Number(value);
}

/** The command that opens a URL in the default browser: an argument list, never a shell string. */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

/** Opens the URL in the default browser; a failure is ignored (the URL is printed anyway). */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  try {
    const { command, args } = browserCommand(platform, url);
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // The address was printed; nothing else to do.
  }
}

/** Runs the setup wizard and resolves when its server stops. */
export async function runSetup(options: SetupOptions, deps: SetupDeps = {}): Promise<void> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const warn = deps.warn ?? ((line: string) => console.warn(line));
  const start = deps.start ?? ((serverOptions) => startInstallerServer(serverOptions));
  const openBrowser = deps.openBrowser ?? ((url: string) => openInBrowser(url));

  const { profile, envFile } = resolveSetupTarget(options, (deps.cwd ?? process.cwd)());
  const port = parseSetupPort(options.port);
  const host = options.listen ?? DEFAULT_INSTALLER_HOST;

  if (!isLoopbackListen(host)) {
    warn(
      pc.yellow(
        `Warning: --listen ${host} accepts connections from other machines. Publish the port to 127.0.0.1 only ` +
          '(for Docker: -p 127.0.0.1:<port>:<port>). The wizard shows secrets and writes your settings file.',
      ),
    );
    warn(
      pc.yellow(
        'If the settings folder is not writable for the image user, use "Download the file" in the last step.',
      ),
    );
  }

  const server = await start({ profile, envFile, host, port });
  log(`\nRirikoAI setup (${profile} install). Settings file: ${server.envFile}`);
  log(`Open this address in your browser:\n  ${pc.cyan(server.url)}`);
  if (options.open !== false) openBrowser(server.url);

  const reason = await server.stopped;
  log(
    reason === 'finished'
      ? pc.green('\nSetup finished. The settings file was written.')
      : `\nSetup stopped (${reason}). Nothing more was written.`,
  );
}

/** Registers `ririko setup`. */
export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Open the step-by-step setup wizard in your browser')
    .option('--docker', 'Write .env.production for the Docker install (default: .env)')
    .option('--env-file <path>', 'Settings file to read and write (.env or .env.production)')
    .option('--port <n>', `Port to listen on (default ${DEFAULT_INSTALLER_PORT})`)
    .option('--listen <host>', `Address to listen on (default ${DEFAULT_INSTALLER_HOST})`)
    .option('--no-open', 'Print the address only; do not open the browser')
    .action(async (options: SetupOptions) => {
      await runSetup(options);
    });
}
