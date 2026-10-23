import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./release-nudge.mjs', import.meta.url));

/** Runs the hook the way Claude Code does: the prompt event as JSON on stdin. */
function runHook(stdin: string) {
  const result = spawnSync(process.execPath, [script], { input: stdin, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function nudgeFor(prompt: string): string | null {
  const { status, stdout } = runHook(JSON.stringify({ prompt }));
  expect(status).toBe(0);
  if (stdout.trim() === '') return null;
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(output.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  return output.hookSpecificOutput.additionalContext;
}

describe('release-nudge hook', () => {
  it.each([
    'release v2.2.0',
    'Release 2.2.0 please',
    'please tag v2.2.1',
    'publish version 2.3.0 now',
    "let's release",
    "Let's release the new version",
    'lets release',
    'time to release',
    'ready to publish',
    'cut a release',
    'make the release for today',
    'start a new release',
    'can you do a release?',
    'go ahead and release',
  ])('adds the line for "%s"', (prompt) => {
    expect(nudgeFor(prompt)).toBe('Use the /release skill; start in plan mode.');
  });

  it.each([
    'fix the bug in the tickets command',
    'what does release-tags.ts do?',
    'explain the release workflow in CircleCI',
    'the released version is 2.1.0',
    'add a release channel setting to the dashboard',
    'tag the user in the reply',
    'update the docs',
    '/release 2.2.0',
    '',
    '<agent-message from="a1">TASK-2043 is in REVIEW. `pnpm release:publish 2.1.0 --dry-run` ...</agent-message>',
    '<system-reminder>The session reported: Scrum-Kanban-Template 0.8.0 is merged; tag v0.8.0 is pending.</system-reminder>',
    '<cross-session-message from="local_1">Release 2.2.0 is ready to tag.</cross-session-message>',
    '<task-notification>Background command "Wait for 2.1.0 images" completed</task-notification>',
    '<ci-monitor-event>PR #746 checks passed; release v2.1.0 can go ahead.</ci-monitor-event>',
  ])('stays quiet for "%s"', (prompt) => {
    expect(nudgeFor(prompt)).toBeNull();
  });

  it('prints one JSON line and nothing on stderr', () => {
    const { stdout, stderr } = runHook(JSON.stringify({ prompt: 'release v2.2.0' }));
    expect(stdout.trim().split('\n')).toHaveLength(1);
    expect(stderr).toBe('');
  });

  it.each(['', 'not json', '{"prompt":42}', '{}', 'null'])(
    'exits quietly for the input %j',
    (stdin) => {
      const { status, stdout } = runHook(stdin);
      expect(status).toBe(0);
      expect(stdout).toBe('');
    },
  );
});
