import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigValidationError } from '@ririko/services/guild';

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  requireGuildAccess: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
  after: [] as Array<() => unknown>,
  guildSettingsChanged: vi.fn(),
  requireStepUp: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.headers,
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/server', () => ({ after: (task: () => unknown) => mocks.after.push(task) }));
vi.mock('./guilds/require-guild-access', () => ({ requireGuildAccess: mocks.requireGuildAccess }));
vi.mock('./auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth/session')>()),
  requireStepUp: mocks.requireStepUp,
}));
vi.mock('./services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com' },
    guildConfig: { update: mocks.update },
    notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
  }),
}));

const { pickFormFields, readFormFields, saveGuildSettings } = await import('./settings-action');

const GUILD = '100000000000000001';

describe('saveGuildSettings (TASK-1112)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.after = [];
    mocks.headers = new Headers({
      origin: 'https://dash.example.com',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'vitest',
    });
    mocks.requireGuildAccess.mockResolvedValue({ session: { userId: 'user-1' } });
  });

  it('rejects requests from another origin before touching Discord or the database', async () => {
    mocks.headers = new Headers({ origin: 'https://evil.example' });
    const state = await saveGuildSettings(GUILD, 'general', { prefix: '?' });

    expect(state.status).toBe('error');
    expect(mocks.requireGuildAccess).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('checks guild access, then saves as the signed-in user with IP and user agent', async () => {
    mocks.update.mockResolvedValue({
      values: { prefix: '?', timezone: 'UTC' },
      changes: [{ field: 'prefix', before: '!', after: '?' }],
    });

    const state = await saveGuildSettings(GUILD, 'general', { prefix: '?' });

    expect(mocks.requireGuildAccess).toHaveBeenCalledWith(GUILD);
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD,
      'general',
      { prefix: '?' },
      { userId: 'user-1', source: 'dashboard', ipAddress: '203.0.113.7', userAgent: 'vitest' },
    );
    expect(state).toEqual({
      status: 'saved',
      message: 'Settings saved.',
      values: { prefix: '?', timezone: 'UTC' },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/${GUILD}`, 'layout');
  });

  it('posts a change notice after the response only when something changed (TASK-1172)', async () => {
    const changes = [{ field: 'prefix', before: '!', after: '?' }];
    mocks.update.mockResolvedValue({ values: { prefix: '?', timezone: 'UTC' }, changes });
    await saveGuildSettings(GUILD, 'general', { prefix: '?' });

    expect(mocks.guildSettingsChanged).not.toHaveBeenCalled();
    expect(mocks.after).toHaveLength(1);
    await mocks.after[0]?.();
    expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD, {
      userId: 'user-1',
      module: 'general',
      changes,
    });

    mocks.after = [];
    mocks.update.mockResolvedValue({ values: { prefix: '?', timezone: 'UTC' }, changes: [] });
    const state = await saveGuildSettings(GUILD, 'general', { prefix: '?' });
    expect(state).toMatchObject({ status: 'saved', message: 'Nothing changed.' });
    expect(mocks.after).toHaveLength(0);
  });

  it('never saves when the guard rejects the guild', async () => {
    mocks.requireGuildAccess.mockRejectedValue(new Error('NEXT_HTTP_ERROR_FALLBACK;404'));
    await expect(saveGuildSettings(GUILD, 'general', { prefix: '?' })).rejects.toThrow('404');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns field errors and the submitted values when validation fails', async () => {
    mocks.update.mockRejectedValue(
      new GuildConfigValidationError({ prefix: ['The command prefix cannot be empty.'] }),
    );
    const state = await saveGuildSettings(GUILD, 'general', { prefix: ' ' });

    expect(state).toEqual({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { prefix: ['The command prefix cannot be empty.'] },
      values: { prefix: ' ' },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('asks for a passkey check before a sensitive save, and writes nothing (TASK-1141)', async () => {
    const session = { userId: 'user-1' };
    mocks.requireGuildAccess.mockResolvedValue({ session });
    mocks.requireStepUp.mockResolvedValue('passkey-check-required');
    const patch = { escalationSteps: '[]' };

    const state = await saveGuildSettings(GUILD, 'moderation', patch, { stepUp: true });

    expect(mocks.requireStepUp).toHaveBeenCalledWith(session);
    expect(state).toEqual({
      status: 'error',
      message: 'Confirm it is you with your passkey first.',
      reason: 'passkey-check-required',
      values: patch,
    });
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.requireStepUp.mockResolvedValue('passkey-required');
    expect(await saveGuildSettings(GUILD, 'moderation', patch, { stepUp: true })).toMatchObject({
      reason: 'passkey-required',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('saves a sensitive module after a recent passkey check, and skips the check otherwise', async () => {
    mocks.requireStepUp.mockResolvedValue('ok');
    mocks.update.mockResolvedValue({ values: { escalationSteps: [] }, changes: [] });
    await saveGuildSettings(GUILD, 'moderation', { escalationSteps: '[]' }, { stepUp: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);

    mocks.requireStepUp.mockClear();
    await saveGuildSettings(GUILD, 'logging', { logChannelId: '' });
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
  });
});

describe('readFormFields (TASK-1141)', () => {
  it('reads text, list and checkbox fields', () => {
    const form = new FormData();
    form.set('action', 'WARN');
    form.append('roles', '1');
    form.append('roles', '2');
    form.set('enabled', 'on');
    expect(
      readFormFields(form, {
        text: ['action', 'missing'],
        list: ['roles', 'channels'],
        flag: ['enabled', 'other'],
      }),
    ).toEqual({ action: 'WARN', roles: ['1', '2'], channels: [], enabled: true, other: false });
  });
});

describe('pickFormFields', () => {
  it('keeps only named string fields that were submitted', () => {
    const form = new FormData();
    form.set('prefix', '?');
    form.set('$ACTION_ID_abc', '');
    form.set('timezone', new Blob(['x']));
    expect(pickFormFields(form, ['prefix', 'timezone', 'missing'])).toEqual({ prefix: '?' });
  });
});
