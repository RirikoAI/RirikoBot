/**
 * Copies the production install files into the documentation site, so ririko.ai/install/ always
 * serves the files of the release the site was built from.
 *
 *   pnpm docs:install            (writes website/static/install/)
 *   tsx scripts/export-install-files.ts [output-dir]
 *
 *   docker-compose.production.yml  ->  install/docker-compose.yml
 *   .env.production.example        ->  install/.env.example
 *
 * The copies are generated at build time and git-ignored; never edit them by hand. The script
 * refuses to publish an env example that holds a secret value.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Source file (relative to the repository root) and the name it is served under. */
export const INSTALL_FILES: readonly { source: string; target: string }[] = [
  { source: 'docker-compose.production.yml', target: 'docker-compose.yml' },
  { source: '.env.production.example', target: '.env.example' },
];

/** Names of settings that must stay empty (or a placeholder) in a published example. */
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|KEY|SP_DC)$/;

/** Returns the names of secret settings that have a value in an env example. */
export function findSecretValues(envText: string): string[] {
  const found: string[] = [];
  for (const line of envText.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match && SECRET_NAME.test(match[1] ?? '') && (match[2] ?? '').trim() !== '') {
      found.push(match[1] ?? '');
    }
  }
  return found;
}

/** Copies the install files into `outDir` and returns the written paths. */
export function exportInstallFiles(outDir: string, root: string = ROOT): string[] {
  const example = readFileSync(resolve(root, '.env.production.example'), 'utf8');
  const secrets = findSecretValues(example);
  if (secrets.length > 0) {
    throw new Error(
      `.env.production.example has values for secret settings: ${secrets.join(', ')}`,
    );
  }
  mkdirSync(outDir, { recursive: true });
  return INSTALL_FILES.map(({ source, target }) => {
    const destination = resolve(outDir, target);
    copyFileSync(resolve(root, source), destination);
    return destination;
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const outDir = resolve(process.argv[2] ?? resolve(ROOT, 'website/static/install'));
  for (const file of exportInstallFiles(outDir)) console.log(`wrote ${file}`);
}
