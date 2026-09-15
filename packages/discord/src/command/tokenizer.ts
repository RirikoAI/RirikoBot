/**
 * Parses a raw command argument string into tokens, supporting double and single quotes
 * as well as escaped characters.
 *
 * Example:
 *   tokenizeCommandArgs('play "YOASOBI Idol" --loop')
 *   => ['play', 'YOASOBI Idol', '--loop']
 */
export function tokenizeCommandArgs(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  const tokens: string[] = [];
  let current = '';
  let inQuotes: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]!;

    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (inQuotes !== null) {
      if (char === inQuotes) {
        // Quote closed
        inQuotes = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      // Quote opened
      inQuotes = char;
    } else if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
