import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupLavalink } from './lavalink-setup.js';

const LAVALINK_DIR = resolve(process.cwd(), 'lavalink');
const JAR_PATH = resolve(LAVALINK_DIR, 'Lavalink.jar');

async function main(): Promise<void> {
  if (!existsSync(JAR_PATH)) {
    console.log('📦 Lavalink not found. Running initial setup first...');
    await setupLavalink();
  }

  console.log('⚡ Starting Lavalink v4 server in', LAVALINK_DIR);
  const lavalinkProcess = spawn('java', ['-jar', 'Lavalink.jar'], {
    cwd: LAVALINK_DIR,
    stdio: 'inherit',
    shell: true,
  });

  lavalinkProcess.on('exit', (code) => {
    console.log(`[Lavalink] Exited with code ${code}`);
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    lavalinkProcess.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    lavalinkProcess.kill('SIGTERM');
  });
}

void main().catch((err) => {
  console.error('❌ Failed to start Lavalink:', err);
  process.exit(1);
});
