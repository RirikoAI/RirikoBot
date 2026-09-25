import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigValidationError } from '@ririko/services/guild';

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  requireGuildAccess: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => mocks.headers }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('./guilds/require-guild-access', () => ({ requireGuildAccess: mocks.requireGuildAccess }));
vi.mock('./services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com' },
    guildConfig: { update: mocks.update },
  }),
}));

const { pickFormFields, saveGuildSettings } = await import('./settings-action');

const GUILD = '100000000000000001';

describe('saveGuildSettings (TASK-1112)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
