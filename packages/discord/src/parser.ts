import { AppError } from '@ririko/core';
import type { CommandArguments, CommandOption } from './contracts.js';

/** Shell-style quotes/escapes without expansion, evaluation, or regex prefix matching. */
export function tokenize(input: string): string[] {
  if (input.length > 4000) throw new AppError('VALIDATION', 'Command input is too long.');
  const tokens: string[] = [];
  let token = '';
  let started = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  const flush = () => {
    if (!started) return;
    tokens.push(token);
    if (tokens.length > 100) throw new AppError('VALIDATION', 'Too many command arguments.');
    token = '';
    started = false;
  };
  for (const char of input) {
    if (escaped) {
      token += char;
      escaped = false;
      started = true;
    } else if (char === '\\') {
      escaped = true;
      started = true;
    } else if (quote !== null) {
      if (char === quote) quote = null;
      else token += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/u.test(char)) {
      flush();
    } else {
      token += char;
      started = true;
    }
  }
  if (quote !== null || escaped) throw new AppError('VALIDATION', 'Close quoted text and escape literal backslashes.');
  flush();
  return tokens;
}

/** Null denotes an ordinary message, including a prefix with no command. */
export function parsePrefix(input: string, prefix: string): readonly string[] | null {
  if (!prefix || !input.startsWith(prefix)) return null;
  const tokens = tokenize(input.slice(prefix.length));
  return tokens.length > 0 ? tokens : null;
}

/** Both transports use this validator; prefix coercion never changes the slash contract. */
export function validateArguments(options: readonly CommandOption[], input: CommandArguments): CommandArguments {
  const names = new Set(options.map((option) => option.name));
  for (const name of Object.keys(input)) {
    if (!names.has(name)) throw new AppError('VALIDATION', `Unknown option: ${name}.`);
  }
  const result: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
  for (const option of options) {
    const raw = input[option.name];
    if (raw === undefined) {
      if (option.required) throw new AppError('VALIDATION', `Provide ${option.name}.`);
      continue;
    }
    let value: string | number | boolean;
    if (option.type === 'integer') {
      if (typeof raw === 'boolean' || (typeof raw === 'string' && !/^-?\d+$/u.test(raw))) {
        throw new AppError('VALIDATION', `${option.name} must be a whole number.`);
      }
      value = Number(raw);
      if (!Number.isSafeInteger(value) || (option.min !== undefined && value < option.min) || (option.max !== undefined && value > option.max)) {
        throw new AppError('VALIDATION', `${option.name} is outside the permitted range.`);
      }
    } else if (option.type === 'boolean') {
      if (raw === true || raw === 'true') value = true;
      else if (raw === false || raw === 'false') value = false;
      else throw new AppError('VALIDATION', `${option.name} must be true or false.`);
    } else {
      if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4000) {
        throw new AppError('VALIDATION', `${option.name} must contain text.`);
      }
      if (option.type === 'string') {
        value = raw;
        if ((option.min !== undefined && value.length < option.min) || (option.max !== undefined && value.length > option.max)) {
          throw new AppError('VALIDATION', `${option.name} has an invalid length.`);
        }
      } else {
        const pattern = option.type === 'user' ? /^(?:<@!?(\d{1,20})>|(\d{1,20}))$/u
          : option.type === 'channel' ? /^(?:<#(\d{1,20})>|(\d{1,20}))$/u
            : /^(?:<@&(\d{1,20})>|(\d{1,20}))$/u;
        const match = raw.match(pattern);
        const id = match?.[1] ?? match?.[2];
        if (!id) throw new AppError('VALIDATION', `${option.name} must be a valid ${option.type} mention or ID.`);
        value = id;
      }
    }
    if (option.choices && !option.choices.some((choice) => choice.value === value)) {
      throw new AppError('VALIDATION', `Choose a valid value for ${option.name}.`);
    }
    result[option.name] = value;
  }
  return Object.freeze(result);
}

/** Positional options, --name value, --name=value, booleans, and -- literal values. */
export function parseArguments(tokens: readonly string[], options: readonly CommandOption[]): CommandArguments {
  const values: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
  const positional: string[] = [];
  const byName = new Map(options.map((option) => [option.name, option]));
  let literal = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) break;
    if (!literal && token === '--') {
      literal = true;
      continue;
    }
    if (literal || !token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const equalAt = token.indexOf('=');
    const name = token.slice(2, equalAt === -1 ? undefined : equalAt);
    const option = byName.get(name);
    if (!option) throw new AppError('VALIDATION', `Unknown option: ${name}.`);
    if (Object.hasOwn(values, name)) throw new AppError('VALIDATION', `Option ${name} was supplied twice.`);
    const inline = equalAt === -1 ? undefined : token.slice(equalAt + 1);
    const next = tokens[index + 1];
    if (inline !== undefined) values[name] = inline;
    else if (option.type === 'boolean' && next !== 'true' && next !== 'false') values[name] = true;
    else if (next !== undefined && !next.startsWith('--')) {
      values[name] = next;
      index++;
    } else throw new AppError('VALIDATION', `Provide ${name}.`);
  }
  const remaining = options.filter((option) => !Object.hasOwn(values, option.name));
  if (positional.length > remaining.length) throw new AppError('VALIDATION', 'Too many arguments. Quote values that contain spaces.');
  positional.forEach((value, index) => {
    const option = remaining[index];
    if (option) values[option.name] = value;
  });
  return validateArguments(options, values);
}
