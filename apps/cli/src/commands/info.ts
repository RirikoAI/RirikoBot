import { CORE_VERSION } from '@ririko/core';
import { Command } from 'commander';
import pc from 'picocolors';

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Display system and runtime environment information')
    .action(() => {
      console.log(pc.bold(pc.magenta('\n🌸 Ririko AI 2.0.0 — System Information\n')));
      console.log(`  ${pc.cyan('Version:')}      ${CORE_VERSION}`);
      console.log(`  ${pc.cyan('Node.js:')}      ${process.version}`);
      console.log(`  ${pc.cyan('Platform:')}     ${process.platform} (${process.arch})`);
      console.log(`  ${pc.cyan('Process ID:')}   ${process.pid}`);
      console.log(`  ${pc.cyan('Uptime:')}       ${Math.floor(process.uptime())}s\n`);
    });
}
