import { describe, expect, it } from 'vitest';
import { createProgram } from './program.js';

describe('CLI Program', () => {
  it('initializes program with name, description, and version', () => {
    const program = createProgram();

    expect(program.name()).toBe('ririko');
    expect(program.description()).toBe('Ririko AI 2.0.0 Operator and Developer CLI');
    expect(program.version()).toBe('2.0.0');
  });

  it('registers core subcommands', () => {
    const program = createProgram();
    const commandNames = program.commands.map((cmd) => cmd.name());

    expect(commandNames).toContain('info');
    expect(commandNames).toContain('doctor');
    expect(commandNames).toContain('migrate:legacy');
    expect(commandNames).toContain('migrate:verify');
  });

  it('registers global options', () => {
    const program = createProgram();
    const optionFlags = program.options.map((opt) => opt.flags);

    expect(optionFlags).toContain('--verbose');
    expect(optionFlags).toContain('--config <path>');
  });
});
