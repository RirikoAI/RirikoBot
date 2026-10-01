#!/usr/bin/env node
// Claude Code PreToolUse hook: CodeGraph before grep.
// Covers Grep, Glob, whole-file Read of source code, and Bash/PowerShell commands that search code
// (grep, rg, find, Select-String, ...) or dump whole source files (cat, Get-Content, ...).
// When the project has a .codegraph/ index and the agent has not called codegraph yet, the first such
// call per agent is denied with a reminder. Later calls pass, so agents can still fall back for
// non-code text or when CodeGraph returns nothing. A ranged Read (offset/limit) always passes: Edit
// needs a prior Read, and a ranged one is the cheap way to satisfy it.
//
// CODEGRAPH_FIRST=strict denies every such call until codegraph has been used; =off disables the hook.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mode = process.env.CODEGRAPH_FIRST ?? 'remind';
if (mode === 'off') process.exit(0);

let input = '';
for await (const chunk of process.stdin) input += chunk;
let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0);
}

const CODE_EXT = /\.(m?[jt]sx?|cjs|py|go|rs|java|kt|cs|c|cc|cpp|h|hpp|php|rb|swift|scala|vue|svelte)\b/i;
const SEARCH_CMD = /(^|[\s;&|(])(grep|egrep|rg|ag|ack|find|findstr|select-string|sls|git\s+grep)(\s|$)|get-childitem\b[^|;]*-recurse|\b(gci|dir|ls)\s+-r/i;
const DUMP_CMD = /(^|[\s;&|(])(cat|head|tail|less|more|type|get-content|gc)\s/i;

const tool = event.tool_name;
const ti = event.tool_input ?? {};
const isCodeLookup = () => {
  if (tool === 'Grep' || tool === 'Glob') return true;
  if (tool === 'Read') return CODE_EXT.test(ti.file_path ?? '') && ti.offset == null && ti.limit == null;
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = ti.command ?? '';
    return SEARCH_CMD.test(cmd) || (DUMP_CMD.test(cmd) && CODE_EXT.test(cmd));
  }
  return false;
};
if (!isCodeLookup()) process.exit(0);

const cwd = event.cwd ?? process.cwd();
const findIndex = (dir) => {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.codegraph', 'codegraph.db'))) return d;
    if (path.dirname(d) === d) return null;
  }
};
const indexRoot = findIndex(cwd);
if (!indexRoot) process.exit(0);

// Sub-agents share the parent's session_id, so key the marker on agent_id too: each worker gets its
// own reminder. Their transcript lives next to the parent's; never use the parent's transcript for a
// sub-agent, or a coordinator's codegraph call would exempt every worker.
const who = `${event.session_id ?? 'nosession'}-${event.agent_id ?? 'main'}`.replace(/[^\w.-]/g, '_');
const tmp = os.tmpdir();
const marker = path.join(tmp, `codegraph-first-${who}`);
const transcript = event.agent_id && !/[\\/]subagents[\\/]/.test(event.transcript_path ?? '')
  ? path.join(path.dirname(event.transcript_path ?? ''), event.session_id ?? '', 'subagents', `agent-${event.agent_id}.jsonl`)
  : event.transcript_path;
// Match an actual tool call (MCP or CLI), not a mention of the tool name in loaded instructions.
const usedCodegraph = () => {
  try {
    const t = fs.readFileSync(transcript ?? '', 'utf8');
    return /"name"\s*:\s*"mcp__codegraph__codegraph_\w+"/.test(t) || /"command"\s*:\s*"codegraph (explore|node|query|context)\b/.test(t);
  } catch {
    return false;
  }
};

if (usedCodegraph()) process.exit(0);
if (mode !== 'strict' && fs.existsSync(marker)) process.exit(0);
try {
  fs.writeFileSync(marker, '');
  // Drop markers older than a day so tmp does not fill up.
  const dayAgo = Date.now() - 86_400_000;
  for (const f of fs.readdirSync(tmp)) {
    if (!f.startsWith('codegraph-first-')) continue;
    const p = path.join(tmp, f);
    if (fs.statSync(p).mtimeMs < dayAgo) fs.rmSync(p, { force: true });
  }
} catch {}

const reason =
  `This project has a CodeGraph index (${path.join(indexRoot, '.codegraph')}). ` +
  `To locate or understand code, call codegraph_explore with projectPath="${indexRoot}" first ` +
  `(or run: codegraph explore "<symbols or question>"); it returns the verbatim source and call paths in one call. ` +
  `If the ticket has context.codegraph_queries, run those. Before an Edit, Read only the line range you need. ` +
  `Use ${tool} only for non-code text (config values, string literals, log messages) or when CodeGraph returned nothing` +
  (mode === 'strict' ? '.' : '; retrying this call will be allowed.');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }),
);
