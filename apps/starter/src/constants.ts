/** Where the Ririko releases live. These are the only hosts the starter talks to. */
export const API_BASE = 'https://api.github.com/repos/RirikoAI/RirikoBot';
export const RAW_BASE = 'https://raw.githubusercontent.com/RirikoAI/RirikoBot';
export const CLONE_URL = 'https://github.com/RirikoAI/RirikoBot.git';
export const SOURCE_BLOB_BASE = 'https://github.com/RirikoAI/RirikoBot/blob';
export const DOCS_URL = 'https://ririko.ai/docs/deployment';

export const DEFAULT_FOLDER = 'ririko';
export const DOCKER_IMAGE = 'ririkoai/ririkobot';
export const WIZARD_PORT = 3999;
export const MIN_SOURCE_NODE_MAJOR = 22;

/**
 * Every file the compose stack needs on disk. The compose file bind-mounts
 * docker/lavalink/application.yml; a missing file would become a folder on `up`.
 * docker-compose.remote-lavalink.yml is the override for a Lavalink node on another machine,
 * which the setup wizard names in its last step.
 */
export const DOCKER_FILES: readonly string[] = [
  'docker-compose.production.yml',
  'docker-compose.remote-lavalink.yml',
  '.env.production.example',
  'docker/lavalink/application.yml',
];

export const COMPOSE_FILE = 'docker-compose.production.yml';
export const ENV_FILE = '.env.production';
