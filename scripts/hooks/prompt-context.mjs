#!/usr/bin/env node
// Claude Code UserPromptSubmit hook. Runs "codegraph prompt-hook" to inject CodeGraph context for the
// prompt, but only when the project has a .codegraph/ index. Teammates without CodeGraph installed get
// no hook error on every prompt.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!fs.existsSync(path.join(root, '.codegraph', 'codegraph.db'))) process.exit(0);

// shell: true so Windows resolves codegraph.cmd.
const r = spawnSync('codegraph prompt-hook', { shell: true, input, encoding: 'utf8', timeout: 30_000 });
if (r.status === 0 && r.stdout) process.stdout.write(r.stdout);
