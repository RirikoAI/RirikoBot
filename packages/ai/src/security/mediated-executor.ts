import type { ToolRegistry } from '../tools/registry.js';
import type { ToolSecurityInterceptor } from './security-interceptor.js';
import type { SecurityExecutionContext, MediatedToolResponse } from './types.js';
import type { ToolCall } from '../types/index.js';
import type { ToolExecutionContext } from '../tools/types.js';

export class MediatedToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly interceptor: ToolSecurityInterceptor,
  ) {}

  /**
   * Mediates and safely executes an LLM-emitted tool call:
   * - Enforces security policies (permissions, module state, allowlist, role hierarchy).
   * - Validates input parameters via tool's Zod schema.
   * - Traps unexpected execution errors into structured error responses.
   * - The LLM is NEVER the security boundary.
   */
  async executeMediated(
    toolCall: ToolCall,
    context: SecurityExecutionContext & ToolExecutionContext,
  ): Promise<MediatedToolResponse> {
    // 1. Evaluate multi-layer security policies
    const verdict = this.interceptor.evaluate({
      toolName: toolCall.name,
      args: toolCall.arguments,
      context,
    });

    if (!verdict.allowed) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: false,
        error: verdict.message,
        denialReason: verdict.reason,
      };
    }

    // 2. Execute with parameter validation
    try {
      const result = await this.registry.execute(
        toolCall.name,
        toolCall.arguments,
        context,
      );

      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: true,
        result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
  }

  /**
   * Batch processes multiple tool calls sequentially with isolated security mediation.
   */
  async executeBatch(
    toolCalls: ToolCall[],
    context: SecurityExecutionContext & ToolExecutionContext,
  ): Promise<MediatedToolResponse[]> {
    const responses: MediatedToolResponse[] = [];
    for (const call of toolCalls) {
      const resp = await this.executeMediated(call, context);
      responses.push(resp);
    }
    return responses;
  }
}
