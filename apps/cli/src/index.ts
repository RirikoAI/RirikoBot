#!/usr/bin/env node
import { CORE_VERSION } from '@ririko/core';
import { Command } from 'commander';

const program = new Command();

program
  .name('ririko')
  .description('Ririko AI 2.0.0 Operator and Developer CLI')
  .version(CORE_VERSION);

program.parse(process.argv);
