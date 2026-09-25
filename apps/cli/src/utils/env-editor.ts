import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Resolves the path to the active .env file based on explicit path or workspace heuristics.
 */
export function resolveEnvFilePath(customPath?: string): string {
  if (customPath) {
    return resolve(process.cwd(), customPath);
  }

  const candidatePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Default to .env in current working directory
  return resolve(process.cwd(), '.env');
}

/**
 * Masks a secret string (API key, token) for safe terminal display.
 */
export function maskSecret(value?: string | null): string {
  if (!value) {
    return '(not set)';
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '(empty)';
  }

  if (trimmed.length <= 8) {
    return '****';
  }

  if (trimmed.length <= 16) {
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-2);
    return `${prefix}****${suffix}`;
  }

  const prefix = trimmed.slice(0, 6);
  const suffix = trimmed.slice(-4);
  return `${prefix}...****...${suffix}`;
}

/**
 * Formats a key/value pair for .env format, adding quotes if necessary.
 */
export function formatEnvLine(key: string, value: string): string {
  const needsQuotes = /[\s#"'\n\r]/.test(value);
  if (needsQuotes) {
    const escaped = value.replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}

/**
 * Reads a .env file and parses its key-value pairs into an object.
 */
export function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf-8');
  const result: Record<string, string> = {};

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && match[1]) {
      const key = match[1];
      let val = match[2] ?? '';
      val = val.trim();

      // Strip matching double or single quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      result[key] = val;
    }
  }

  return result;
}

export interface UpdateEnvResult {
  updatedKeys: string[];
  addedKeys: string[];
  filePath: string;
}

/**
 * Safely updates key-value pairs in a .env file.
 * Preserves comments and existing formatting.
 * If keys already exist, their lines are updated in place.
 * Any newly added keys are appended in an organized section.
 */
export function updateEnvFile(
  filePath: string,
  updates: Record<string, string | undefined>,
  sectionHeader = '# AI Chatbot & LLM Providers Configuration',
): UpdateEnvResult {
  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const updatedKeys: string[] = [];
  const addedKeys: string[] = [];

  const remainingUpdates = { ...updates };

  // 1. In-place replacement for existing keys
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match KEY=... or # KEY=... (commented out key)
    const match = line.match(/^#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && match[1]) {
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(remainingUpdates, key)) {
        const newValue = remainingUpdates[key];
        if (newValue !== undefined) {
          lines[i] = formatEnvLine(key, newValue);
          updatedKeys.push(key);
        }
        delete remainingUpdates[key];
      }
    }
  }

  // 2. Append newly added keys
  const keysToAppend = Object.entries(remainingUpdates).filter(
    ([, val]) => val !== undefined,
  ) as Array<[string, string]>;

  if (keysToAppend.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') {
      lines.push('');
    }
    if (sectionHeader) {
      lines.push(sectionHeader);
    }
    for (const [key, value] of keysToAppend) {
      lines.push(formatEnvLine(key, value));
      addedKeys.push(key);
    }
    lines.push('');
  }

  const finalContent = lines.join('\n');
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, finalContent, 'utf-8');

  return {
    updatedKeys,
    addedKeys,
    filePath,
  };
}
