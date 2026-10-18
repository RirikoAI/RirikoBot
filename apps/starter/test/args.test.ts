import { describe, expect, it } from 'vitest';
import { helpText, parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('defaults to the folder ririko and asks for the mode', () => {
    expect(parseArgs([])).toEqual({
      kind: 'run',
      options: { folder: 'ririko', mode: null, ref: null },
    });
  });

  it('reads the folder, the mode and the ref', () => {
    expect(parseArgs(['my-bot', '--docker', '--ref', 'v2.0.0'])).toEqual({
      kind: 'run',
      options: { folder: 'my-bot', mode: 'docker', ref: 'v2.0.0' },
    });
    expect(parseArgs(['--source', '--ref=v2.1.3', 'x'])).toEqual({
      kind: 'run',
      options: { folder: 'x', mode: 'source', ref: 'v2.1.3' },
    });
  });

  it('accepts a release candidate tag for --ref', () => {
    expect(parseArgs(['--ref', 'v2.0.0-rc.8'])).toMatchObject({
      kind: 'run',
      options: { ref: 'v2.0.0-rc.8' },
    });
  });

  it('accepts the same mode twice and reads a folder after --', () => {
    expect(parseArgs(['--docker', '--docker', '--', '--odd'])).toEqual({
      kind: 'run',
      options: { folder: '--odd', mode: 'docker', ref: null },
    });
  });

  it('answers --help and --version', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['x', '-h'])).toEqual({ kind: 'help' });
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgs(['-v'])).toEqual({ kind: 'version' });
  });

  it('rejects both modes, an unknown option, a second folder and a bad ref', () => {
    expect(parseArgs(['--docker', '--source'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--nope'])).toEqual({ kind: 'error', message: 'Unknown option --nope.' });
    expect(parseArgs(['a', 'b'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--ref'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--ref='])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--ref', 'main'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--ref', '--docker'])).toMatchObject({ kind: 'error' });
  });
});

describe('helpText', () => {
  it('names the version and every option', () => {
    const text = helpText('2.0.0');
    expect(text).toContain('ririko 2.0.0');
    for (const option of ['--docker', '--source', '--ref', '--help', '--version']) {
      expect(text).toContain(option);
    }
  });
});
