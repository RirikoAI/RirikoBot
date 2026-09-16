export type SecurityDenialReason =
  | 'PROHIBITED_TOOL'
  | 'GUILD_TOOL_DISABLED'
  | 'MODULE_DISABLED'
  | 'USER_PERMISSION_DENIED'
  | 'BOT_PERMISSION_DENIED'
  | 'ROLE_HIERARCHY_VIOLATION'
  | 'INVALID_CONTEXT';

export interface SecurityExecutionContext {
  userId: string;
  guildId?: string | undefined;
  channelId?: string | undefined;
  userPermissions?: bigint | undefined;
  botPermissions?: bigint | undefined;
  userHighestRolePosition?: number | undefined;
  botHighestRolePosition?: number | undefined;
  targetHighestRolePosition?: number | undefined;
  allowedTools?: string[] | undefined;
  isModuleEnabled?: ((moduleName: string) => boolean) | undefined;
}

export interface SecurityCheckRequest {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  context: SecurityExecutionContext;
}

export type SecurityVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: SecurityDenialReason;
      message: string;
      requiredPermission?: bigint | undefined;
    };

export interface MediatedToolResponse {
  toolCallId: string;
  name: string;
  success: boolean;
  result?: unknown | undefined;
  error?: string | undefined;
  denialReason?: SecurityDenialReason | undefined;
}
