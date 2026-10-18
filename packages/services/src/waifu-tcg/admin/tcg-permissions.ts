/**
 * Whether a member may run the guild's TCG administration: server admins, and members with
 * the guild's TCG Manager Role.
 */
export function canManageGuildTcg(options: {
  isServerAdmin?: boolean | undefined;
  memberRoles?: readonly string[] | undefined;
  managerRoleId?: string | null | undefined;
}): boolean {
  if (options.isServerAdmin) return true;
  if (!options.managerRoleId) return false;
  return options.memberRoles?.includes(options.managerRoleId) ?? false;
}
