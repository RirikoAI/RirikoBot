import type { Command as CatalogEntry, CommandCatalogRepository } from '@ririko/database';
import { resolvePermissionNames, type Command } from '@ririko/discord';

/** Longest `commands.default_permission` value the Postgres column holds. */
const MAX_PERMISSION_TEXT = 64;

/**
 * Catalog rows for the registered commands the dashboard may override. Hidden and owner-only
 * commands are left out, since guilds never see them.
 */
export function toCatalogEntries(commands: readonly Command[]): CatalogEntry[] {
  return commands
    .filter(({ metadata }) => !metadata.isHidden && !metadata.isOwnerOnly)
    .map(({ metadata }) => {
      const permissions = resolvePermissionNames(metadata.userPermissions ?? []);
      const permissionText = permissions.join(',');
      return {
        name: metadata.name,
        category: metadata.category,
        description: metadata.description,
        slashEnabled: metadata.slashEnabled !== false,
        prefixEnabled: metadata.prefixEnabled !== false,
        defaultPermission:
          permissions.length === 0
            ? null
            : permissionText.length <= MAX_PERMISSION_TEXT
              ? permissionText
              : (permissions[0] ?? null),
        cooldownSeconds: metadata.cooldownSeconds ?? 0,
      };
    });
}

/**
 * Writes the registered commands to the `commands` table. A failure only means the dashboard
 * shows the previous list, so it is logged and startup continues.
 */
export async function syncCommandCatalog(
  commands: readonly Command[],
  repo: CommandCatalogRepository,
): Promise<void> {
  try {
    const entries = toCatalogEntries(commands);
    await repo.replaceAll(entries);
    console.log(`✓ Recorded ${entries.length} commands for the dashboard.`);
  } catch (error) {
    console.error('✖ Failed to record the command catalog:', error);
  }
}
