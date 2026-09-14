import pc from 'picocolors';
import { allChecks } from './checks.js';
import { DiagnosticCheck, DiagnosticResult } from './types.js';

export interface DoctorReport {
  results: DiagnosticResult[];
  passedCount: number;
  warnCount: number;
  failCount: number;
  isHealthy: boolean;
}

export async function runDiagnostics(
  checks: DiagnosticCheck[] = allChecks,
  options: { silent?: boolean } = {},
): Promise<DoctorReport> {
  const results: DiagnosticResult[] = [];

  for (const check of checks) {
    try {
      const outcome = await check.run();
      results.push({
        name: check.name,
        required: check.required,
        status: outcome.status,
        message: outcome.message,
        details: outcome.details,
      });
    } catch (err: unknown) {
      results.push({
        name: check.name,
        required: check.required,
        status: check.required ? 'fail' : 'warn',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passedCount = results.filter((r) => r.status === 'pass').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const isHealthy = failCount === 0;

  if (!options.silent) {
    printDoctorReport(results, { passedCount, warnCount, failCount, isHealthy });
  }

  return { results, passedCount, warnCount, failCount, isHealthy };
}

export function printDoctorReport(
  results: DiagnosticResult[],
  summary: { passedCount: number; warnCount: number; failCount: number; isHealthy: boolean },
): void {
  console.log(pc.bold(pc.magenta('\n🩺 Ririko AI 2.0.0 — System Diagnostics (Doctor)\n')));

  for (const res of results) {
    if (res.status === 'pass') {
      console.log(`  ${pc.green('✓')} ${pc.bold(res.name)}: ${pc.gray(res.message)}`);
    } else if (res.status === 'warn') {
      console.log(`  ${pc.yellow('!')} ${pc.bold(res.name)}: ${pc.yellow(res.message)}`);
    } else {
      console.log(`  ${pc.red('✖')} ${pc.bold(res.name)}: ${pc.red(res.message)}`);
    }
  }

  console.log('');
  if (summary.isHealthy) {
    console.log(
      pc.bold(
        pc.green(
          `Diagnosis: ${summary.passedCount} passed, ${summary.warnCount} optional warnings. System healthy! ✨\n`,
        ),
      ),
    );
  } else {
    console.log(
      pc.bold(
        pc.red(
          `Diagnosis: ${summary.failCount} critical check(s) failed. Please resolve the errors above.\n`,
        ),
      ),
    );
  }
}
