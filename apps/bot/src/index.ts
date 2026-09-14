import { CORE_VERSION } from '@ririko/core';
import { DB_PACKAGE } from '@ririko/database';
import { DISCORD_PACKAGE } from '@ririko/discord';

export function getBotInfo() {
  return {
    version: CORE_VERSION,
    database: DB_PACKAGE,
    discord: DISCORD_PACKAGE,
  };
}
