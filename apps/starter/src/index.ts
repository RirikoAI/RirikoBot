#!/usr/bin/env node
import { createNodeDeps } from './node-deps.js';
import { runStarter } from './run.js';

process.exitCode = await runStarter(process.argv.slice(2), createNodeDeps());
