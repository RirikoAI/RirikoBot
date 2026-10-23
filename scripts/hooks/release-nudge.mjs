#!/usr/bin/env node
// Claude Code UserPromptSubmit hook. When a prompt asks to release, tag or publish a version, it adds
// one line of context that points to the /release skill (.claude/skills/release/SKILL.md), so every
// release starts in plan mode. For any other prompt it prints nothing.

import { pathToFileURL } from 'node:url';

export const NUDGE = 'Use the /release skill; start in plan mode.';

// A verb and a version number close together: "release v2.2.0", "tag 2.2", "publish version 2.2.1".
const VERB_AND_VERSION = /\b(?:release|publish|tag)\b[^\n]{0,40}?\bv?\d+\.\d+/i;
// "cut a release", "make the release", "start a new release", "ship another release".
const DO_A_RELEASE = /\b(?:cut|make|do|start|prepare|run|ship)\s+(?:a|an|the|another|new)\s+(?:new\s+)?release\b/i;
// "let's release", "time to release", "ready to publish", "go ahead and release".
const LETS_RELEASE = /\b(?:let'?s|lets|time\s+to|ready\s+to|go\s+ahead\s+and)\s+(?:release|publish)\b/i;

// Messages the harness delivers as a prompt but no person typed: agent hand-backs, cross-session
// messages, task notifications, CI events and system reminders all start with a tag such as
// "<agent-message", "<cross-session-message" or "<system-reminder".
const HARNESS_MESSAGE = /^<[a-z][\w-]*[\s>]/i;

/** True when the person asks to release, tag or publish a version. */
export function asksForRelease(prompt) {
  const text = String(prompt ?? '').trim();
  // /release already loads the skill; nothing to point to.
  if (/^\/release\b/i.test(text)) return false;
  // A report that mentions a release is not a request to make one.
  if (HARNESS_MESSAGE.test(text)) return false;
  return VERB_AND_VERSION.test(text) || DO_A_RELEASE.test(text) || LETS_RELEASE.test(text);
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let prompt = '';
  try {
    prompt = JSON.parse(input).prompt ?? '';
  } catch {
    return;
  }
  if (!asksForRelease(prompt)) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: NUDGE },
    }) + '\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
