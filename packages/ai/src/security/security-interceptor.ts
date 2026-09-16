import type { ToolRegistry } from '../tools/registry.js';
import type {
  SecurityCheckRequest,
  SecurityVerdict,
} from './types.js';

export const PROHIBITED_PATTERNS = [
  /^exec(?:ute)?$/i,
  /^spawn$/i,
  /^eval$/i,
  /^cmd$/i,
  /^powershell$/i,
  /^bash$/i,
  /^sh$/i,
  /^shell(?:\.|$)/i,
  /^fs(?:\.|$)/i,
  /^file(?:\.|$)/i,
  /^sql(?:\.|$)/i,
  /^db(?:\.|$)/i,
  /^database(?:\.|$)/i,
  /^admin(?:\.|$)/i,
  /^system(?:\.|$)/i,
];

export class ToolSecurityInterceptor {
  constructor(private readonly registry: ToolRegistry) {}

  /**
   * Evaluates an incoming tool call against multi-layer application security policies:
   * 1. Strict Prohibited Pattern Firewall
   * 2. Allowlist Registration Check
   * 3. Guild Allowed Tools Policy
   * 4. Module Enablement State
   * 5. Caller Discord Permissions
   * 6. Bot Discord Permissions
   * 7. Role Hierarchy Constraints
   */
  evaluate(request: SecurityCheckRequest): SecurityVerdict {
    const { toolName, context } = request;

    // 1. Prohibited Pattern Firewall
    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.test(toolName)) {
        return {
          allowed: false,
          reason: 'PROHIBITED_TOOL',
          message: `Tool "${toolName}" violates security policies and is strictly prohibited.`,
        };
      }
    }

    // 2. Allowlist Registration Check
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        allowed: false,
        reason: 'PROHIBITED_TOOL',
        message: `Tool "${toolName}" is not registered in the safe tool allowlist.`,
      };
    }

    // 3. Guild Allowed Tools Policy
    if (context.allowedTools && context.allowedTools.length > 0) {
      if (!context.allowedTools.includes(toolName)) {
        return {
          allowed: false,
          reason: 'GUILD_TOOL_DISABLED',
          message: `Tool "${toolName}" is disabled in this server's configuration.`,
        };
      }
    }

    // 4. Module Enablement State
    if (tool.moduleName && context.isModuleEnabled) {
      if (!context.isModuleEnabled(tool.moduleName)) {
        return {
          allowed: false,
          reason: 'MODULE_DISABLED',
          message: `Module "${tool.moduleName}" is currently disabled in this server.`,
        };
      }
    }

    // 5. Caller Discord Permissions
    if (tool.requiredPermission !== undefined) {
      const userPerms = context.userPermissions ?? 0n;
      const hasPermission = (userPerms & tool.requiredPermission) === tool.requiredPermission;

      if (!hasPermission) {
        return {
          allowed: false,
          reason: 'USER_PERMISSION_DENIED',
          message: 'Permission Denied: You do not possess the required Discord permissions to execute this action.',
          requiredPermission: tool.requiredPermission,
        };
      }
    }

    // 6. Bot Discord Permissions
    if (tool.requiredPermission !== undefined) {
      const botPerms = context.botPermissions ?? 0n;
      const botHasPermission = (botPerms & tool.requiredPermission) === tool.requiredPermission;

      if (!botHasPermission) {
        return {
          allowed: false,
          reason: 'BOT_PERMISSION_DENIED',
          message: 'Permission Denied: Ririko lacks the necessary Discord permissions in this server to perform this action.',
          requiredPermission: tool.requiredPermission,
        };
      }
    }

    // 7. Role Hierarchy Constraints (if targeting a member)
    if (context.targetHighestRolePosition !== undefined) {
      const userPos = context.userHighestRolePosition ?? 0;
      if (userPos <= context.targetHighestRolePosition) {
        return {
          allowed: false,
          reason: 'ROLE_HIERARCHY_VIOLATION',
          message: 'Role Hierarchy Violation: Your role must be higher than the target member.',
        };
      }

      const botPos = context.botHighestRolePosition ?? 0;
      if (botPos <= context.targetHighestRolePosition) {
        return {
          allowed: false,
          reason: 'ROLE_HIERARCHY_VIOLATION',
          message: 'Role Hierarchy Violation: Ririko\'s role must be higher than the target member.',
        };
      }
    }

    return { allowed: true };
  }
}
