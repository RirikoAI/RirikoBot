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
    expect(commandNames).toContain('generate:po-token');
    expect(commandNames).toContain('ai:configure');
  });

  it('registers ai:configure command options and aliases', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'ai:configure');
    expect(cmd).toBeDefined();
    expect(cmd?.aliases()).toContain('ai:config');

    const cmdFlags = cmd?.options.map((opt) => opt.flags) ?? [];
    expect(cmdFlags).toContain('-p, --provider <provider>');
    expect(cmdFlags).toContain('-m, --model <model>');
    expect(cmdFlags).toContain('--gemini-key <key>');
    expect(cmdFlags).toContain('--openai-key <key>');
    expect(cmdFlags).toContain('--openai-base-url <url>');
    expect(cmdFlags).toContain('--ollama-url <url>');
    expect(cmdFlags).toContain('--show');
    expect(cmdFlags).toContain('--test');
    expect(cmdFlags).toContain('-i, --interactive');
    expect(cmdFlags).toContain('-y, --yes');
  });

  it('registers global options', () => {
    const program = createProgram();
    const optionFlags = program.options.map((opt) => opt.flags);

    expect(optionFlags).toContain('--verbose');
    expect(optionFlags).toContain('--config <path>');
  });

  it('registers generate:po-token options including chrome, firefox and login', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'generate:po-token');
    expect(cmd).toBeDefined();

    const cmdFlags = cmd?.options.map((opt) => opt.flags) ?? [];
    expect(cmdFlags).toContain('-s, --save');
    expect(cmdFlags).toContain('-c, --chrome');
    expect(cmdFlags).toContain('-f, --firefox');
    expect(cmdFlags).toContain('-b, --browser <engine>');
    expect(cmdFlags).toContain('-l, --login');
  });
});
