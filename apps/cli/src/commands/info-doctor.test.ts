import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { CORE_VERSION } from '@ririko/core';

const diagnostics = vi.hoisted(() => ({
  report: { isHealthy: true } as { isHealthy: boolean },
  calls: 0,
}));

vi.mock('../doctor/engine.js', () => ({
  runDiagnostics: async () => {
    diagnostics.calls += 1;
    return diagnostics.report;
  },
}));

import { registerInfoCommand } from './info.js';
import { registerDoctorCommand } from './doctor.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

describe('ririko info and doctor commands (TASK-1252)', () => {
  let out: string[];
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    out = [];
    diagnostics.calls = 0;
    diagnostics.report = { isHealthy: true };
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
  });

  const run = async (register: (program: Command) => void, name: string) => {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(['node', 'ririko', name]);
  };

  it('info prints the version and runtime details', async () => {
    await run(registerInfoCommand, 'info');
    const text = out.join('\n').replace(ANSI, '');
    expect(text).toContain('Ririko AI 2.0.0 — System Information');
    expect(text).toContain(`Version:      ${CORE_VERSION}`);
    expect(text).toContain(`Node.js:      ${process.version}`);
    expect(text).toContain(`Platform:     ${process.platform} (${process.arch})`);
    expect(text).toContain(`Process ID:   ${process.pid}`);
    expect(text).toMatch(/Uptime:\s+\d+s/);
  });

  it('doctor leaves the exit code alone when every check is healthy', async () => {
    await run(registerDoctorCommand, 'doctor');
    expect(diagnostics.calls).toBe(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('doctor sets exit code 1 when a required check fails', async () => {
    diagnostics.report = { isHealthy: false };
    await run(registerDoctorCommand, 'doctor');
    expect(diagnostics.calls).toBe(1);
    expect(process.exitCode).toBe(1);
  });
});
