import { describe, expect, it } from 'vitest';
import { discordTokenCheck, nodeCheck } from './checks.js';
import { runDiagnostics } from './engine.js';
import { DiagnosticCheck } from './types.js';

describe('Diagnostics Engine (Doctor)', () => {
  it('runs custom checks and aggregates passed and warn counts', async () => {
    const mockChecks: DiagnosticCheck[] = [
      {
        name: 'Pass Check',
        required: true,
        run: () => ({ status: 'pass', message: 'All good' }),
      },
      {
        name: 'Warn Check',
        required: false,
        run: () => ({ status: 'warn', message: 'Optional missing' }),
      },
    ];

    const report = await runDiagnostics(mockChecks, { silent: true });

    expect(report.isHealthy).toBe(true);
    expect(report.passedCount).toBe(1);
    expect(report.warnCount).toBe(1);
    expect(report.failCount).toBe(0);
    expect(report.results).toHaveLength(2);
  });

  it('marks report as unhealthy if a required check fails', async () => {
    const mockChecks: DiagnosticCheck[] = [
      {
        name: 'Failing Required Check',
        required: true,
        run: () => ({ status: 'fail', message: 'Missing critical resource' }),
      },
    ];

    const report = await runDiagnostics(mockChecks, { silent: true });

    expect(report.isHealthy).toBe(false);
    expect(report.failCount).toBe(1);
  });

  it('catches thrown check errors and flags them without throwing', async () => {
    const mockChecks: DiagnosticCheck[] = [
      {
        name: 'Exploding Check',
        required: true,
        run: () => {
          throw new Error('Connection reset by peer');
        },
      },
    ];

    const report = await runDiagnostics(mockChecks, { silent: true });

    expect(report.isHealthy).toBe(false);
    expect(report.results[0]?.status).toBe('fail');
    expect(report.results[0]?.message).toContain('Connection reset by peer');
  });

  it('verifies Node.js check passes on current Node runtime', async () => {
    const result = await nodeCheck.run();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('Node.js');
  });

  it('verifies Discord token check detects missing vs present token', async () => {
    const originalToken = process.env.DISCORD_TOKEN;
    try {
      delete process.env.DISCORD_TOKEN;
      const failResult = await discordTokenCheck.run();
      expect(failResult.status).toBe('fail');

      process.env.DISCORD_TOKEN = 'mock-test-token-12345';
      const passResult = await discordTokenCheck.run();
      expect(passResult.status).toBe('pass');
      expect(passResult.message).toContain('Configured');
    } finally {
      if (originalToken !== undefined) {
        process.env.DISCORD_TOKEN = originalToken;
      } else {
        delete process.env.DISCORD_TOKEN;
      }
    }
  });
});
