/** Most characters of an error message that reach a log line. */
const MAX_MESSAGE_LENGTH = 200;
/** Stack frames kept after the message, enough to find the throwing code. */
const MAX_STACK_FRAMES = 4;

/** `code`, `status` or `statusCode` of an error from Discord, a provider SDK or Node, if numeric or text. */
function codeOf(error: object): string | undefined {
  for (const key of ['code', 'status', 'statusCode'] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'number' || (typeof value === 'string' && value.length <= 40)) {
      return `${key} ${value}`;
    }
  }
  return undefined;
}

/**
 * Describes a thrown value for a log line without the parts that can hold user text: the error
 * name, its code or status, a message cut to 200 characters, the provider id of an AI provider
 * error and the first stack frames. It never includes `details`, `cause`, a Discord
 * `requestBody` or any other property. Logging the error object itself prints those, and they
 * can carry chat text, prompts or AI replies (STORY-193).
 */
export function describeErrorForLog(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return `Non-error thrown (${typeof error})`;
  }
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  const provider = (error as { providerId?: unknown }).providerId;
  const stack = (error as { stack?: unknown }).stack;

  const parts = [typeof name === 'string' && name ? name : 'Error'];
  const code = codeOf(error);
  if (code) parts.push(`(${code})`);
  if (typeof provider === 'string' && provider) parts.push(`[provider ${provider}]`);
  if (typeof message === 'string' && message) {
    const flat = message.replace(/\s+/g, ' ').trim();
    parts.push(
      flat.length > MAX_MESSAGE_LENGTH ? `: ${flat.slice(0, MAX_MESSAGE_LENGTH)}...` : `: ${flat}`,
    );
  }
  let line = parts.join(' ').replace(' :', ':');
  if (typeof stack === 'string') {
    const frames = stack
      .split('\n')
      .map((frame) => frame.trim())
      .filter((frame) => frame.startsWith('at '))
      .slice(0, MAX_STACK_FRAMES);
    if (frames.length > 0) line += `\n  ${frames.join('\n  ')}`;
  }
  return line;
}
