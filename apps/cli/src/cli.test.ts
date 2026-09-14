import { expect, it } from 'vitest';
import { runCli } from './cli.js';
import { registrationPayload } from './sync.js';
import { CommandRegistry, createBuiltinCommands } from '@ririko/discord';
import { SettingsService } from '@ririko/core';

it('supports offline version/help and rejects unimplemented commands explicitly', async () => {
  const out: string[] = [];
  const errors: string[] = [];
  const context = { env: {}, cwd: process.cwd(), out: (text: string) => { out.push(text); }, error: (text: string) => { errors.push(text); } };
  expect(await runCli(['version'], context)).toBe(0);
  expect(out).toContain('2.0.0');
  expect(await runCli(['help'], context)).toBe(0);
  expect(await runCli(['migrate:legacy'], context)).toBe(1);
  expect(errors[0]).toContain('unimplemented');
});

it('generates slash options, permissions and context menus from registered metadata', () => {
  const settings = new SettingsService({ get: () => Promise.resolve(undefined), save: () => Promise.reject(new Error('unused')) });
  const registry = new CommandRegistry();
  for (const command of createBuiltinCommands(settings, registry)) registry.register(command);
  const payload = registrationPayload(registry.list());
  expect(payload).toHaveLength(5);
  expect(payload).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'prefix', default_member_permissions: '32', options: [expect.objectContaining({ name: 'newprefix', type: 3 })] }),
    expect.objectContaining({ name: 'Ping from user context', type: 2 }),
    expect.objectContaining({ name: 'Ping from chat context', type: 3 }),
  ]));
});
