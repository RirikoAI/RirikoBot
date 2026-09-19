export type ReactionRoleType = 'EMOJI' | 'BUTTON' | 'SELECT_MENU';

export type ReactionRoleMode = 'TOGGLE' | 'GIVE_ONLY' | 'REMOVE_ONLY' | 'UNIQUE';

export interface RoleAssignmentResult {
  success: boolean;
  action: 'ADDED' | 'REMOVED' | 'NOOP' | 'FAILED';
  roleId: string;
  roleName?: string;
  message?: string;
}

export interface AutoRoleJoinResult {
  success: boolean;
  assignedRoles: string[];
  skippedRoles: string[];
  error?: string;
}

export interface VerificationResult {
  success: boolean;
  alreadyVerified: boolean;
  roleId?: string;
  message: string;
}

export interface TemporaryRoleResult {
  success: boolean;
  roleId: string;
  expiresAt?: Date;
  error?: string;
}

export interface RoleSweeperResult {
  sweptCount: number;
  errors: string[];
}
