/**
 * Runs the fake Discord API as its own process, for Playwright's `webServer`:
 *   tsx tests/support/fake-discord/cli.ts --port 3199
 * Ready once `GET /__fake/health` answers.
 */
import { startFakeDiscord } from './server.js';

const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 3199;
if (!Number.isInteger(port) || port <= 0) {
  console.error('Usage: tsx tests/support/fake-discord/cli.ts --port <port>');
  process.exit(1);
}

const server = await startFakeDiscord({ port });
console.log(`Fake Discord API listening on ${server.apiUrl}`);

const stop = () => {
  void server.close().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
