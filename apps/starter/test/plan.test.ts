import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeUpCommand,
  describeCommand,
  dockerChecks,
  dockerDownloads,
  settingsPath,
  sourceChecks,
  sourceCommands,
  wizardCommand,
} from '../src/plan.js';

const FOLDER = resolve('/work/ririko');

describe('docker commands', () => {
  it('checks docker and docker compose', () => {
    expect(dockerChecks().map(describeCommand)).toEqual([
      'docker --version',
      'docker compose version',
    ]);
  });

  it('downloads every file the compose stack needs from the tag', () => {
    expect(dockerDownloads('v2.0.0')).toEqual([
      {
        path: 'docker-compose.production.yml',
        url: 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.0/docker-compose.production.yml',
      },
      {
        path: 'docker-compose.remote-lavalink.yml',
        url: 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.0/docker-compose.remote-lavalink.yml',
      },
      {
        path: '.env.production.example',
        url: 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.0/.env.production.example',
      },
      {
        path: 'docker/lavalink/application.yml',
        url: 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.0/docker/lavalink/application.yml',
      },
    ]);
  });

  it('runs the wizard from the image of the exact version, on 127.0.0.1 only', () => {
    expect(wizardCommand(FOLDER, 'v2.0.0', true)).toEqual({
      name: 'Setup wizard',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-it',
        '-p',
        '127.0.0.1:3999:3999',
        '-v',
        `${FOLDER}:/setup`,
        'ririkoai/ririkobot:2.0.0',
        'ririko',
        'setup',
        '--docker',
        '--env-file',
        '/setup/.env.production',
        '--listen',
        '0.0.0.0',
        '--no-open',
      ],
    });
  });

  it('runs the wizard as the host user where there are user ids (Linux, macOS)', () => {
    expect(wizardCommand(FOLDER, 'v2.0.0', true, '1000:1000').args).toEqual([
      'run',
      '--rm',
      '--user',
      '1000:1000',
      '-it',
      '-p',
      '127.0.0.1:3999:3999',
      '-v',
      `${FOLDER}:/setup`,
      'ririkoai/ririkobot:2.0.0',
      'ririko',
      'setup',
      '--docker',
      '--env-file',
      '/setup/.env.production',
      '--listen',
      '0.0.0.0',
      '--no-open',
    ]);
  });

  it('adds no --user without user ids (Windows)', () => {
    expect(wizardCommand(FOLDER, 'v2.0.0', true, null).args).not.toContain('--user');
    expect(wizardCommand(FOLDER, 'v2.0.0', true).args).not.toContain('--user');
  });

  it('leaves out -t when there is no terminal', () => {
    const args = wizardCommand(FOLDER, 'v2.0.0', false).args;
    expect(args).toContain('-i');
    expect(args).not.toContain('-it');
  });

  it('starts the stack on the image version of the release, in the folder', () => {
    expect(composeUpCommand(FOLDER, 'v2.0.0')).toEqual({
      name: 'Start the stack',
      command: 'docker',
      args: [
        'compose',
        '-f',
        'docker-compose.production.yml',
        '--env-file',
        '.env.production',
        'up',
        '-d',
      ],
      cwd: FOLDER,
      env: { RIRIKO_VERSION: '2.0.0' },
    });
  });

  it('finds the settings file in the folder', () => {
    expect(settingsPath(FOLDER)).toBe(join(FOLDER, '.env.production'));
  });
});

describe('source commands', () => {
  it('checks git', () => {
    expect(sourceChecks().map(describeCommand)).toEqual(['git --version']);
  });

  it('clones the tag, enables pnpm, installs and runs the wizard', () => {
    expect(sourceCommands(FOLDER, 'v2.0.0')).toEqual([
      {
        name: 'Download the release',
        command: 'git',
        args: [
          'clone',
          '--branch',
          'v2.0.0',
          '--depth',
          '1',
          'https://github.com/RirikoAI/RirikoBot.git',
          FOLDER,
        ],
      },
      { name: 'Enable pnpm', command: 'corepack', args: ['enable', 'pnpm'], cwd: FOLDER },
      { name: 'Install the dependencies', command: 'pnpm', args: ['install'], cwd: FOLDER },
      { name: 'Setup wizard', command: 'pnpm', args: ['installer'], cwd: FOLDER },
    ]);
  });
});
