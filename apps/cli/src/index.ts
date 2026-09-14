#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { publicError } from '@ririko/core';
import { runCli } from './cli.js';

try {
  if (existsSync('.env')) process.loadEnvFile('.env');
  process.exitCode = await runCli(process.argv.slice(2), { env: process.env, cwd: process.cwd(), out: (text) => console.log(text), error: (text) => console.error(text) });
} catch (error) {
  console.error(publicError(error));
  process.exitCode = 1;
}
