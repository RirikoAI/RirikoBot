import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelError } from '@/lib/server/guilds/reaction-role-panels';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  flushAfter,
  GUILD_ID,
  harness,
  makeSession,
  resetHarness,
  revalidatePath,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  removeBinding: vi.fn(),
  deletePanel: vi.fn(),
  guildSettingsChanged: vi.fn(),
}));

vi.mock(
  'next/headers',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextHeadersMock,
);
vi.mock(
  'next/navigation',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextNavigationMock,
);
vi.mock(
  'next/cache',
  async () => (await import('../../../../../../../tests/support/web-action-harness')).nextCacheMock,
);
vi.mock(
  'next/server',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextServerMock,
);
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () =>
    baseServices({
      reactionRolePanels: {
        publish: mocks.publish,
        removeBinding: mocks.removeBinding,
        deletePanel: mocks.deletePanel,
      },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { publishReactionRolePanel, removeReactionRoleBinding, deleteReactionRolePanel } =
  await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const changes = [{ field: 'Panel', before: null, after: 'posted' }];

describe('reaction role panel actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  describe('guards (every write posts as Ririko)', () => {
    it('refuses another origin', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel: '{}' }),
      );
      expect(state).toMatchObject({ status: 'error' });
      expect(mocks.publish).not.toHaveBeenCalled();
    });

    it('answers 404 for a guild the user cannot manage', async () => {
      harness.guildAccess = 'denied';
      await expect(
        removeReactionRoleBinding(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ bindingId: 'b1' })),
      ).rejects.toThrow('NOT_FOUND');
      expect(mocks.removeBinding).not.toHaveBeenCalled();
    });

    it('asks for a passkey check when the last one is older than five minutes', async () => {
      harness.session = makeSession(harness.userId, new Date(Date.now() - 6 * 60_000));
      const state = await deleteReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ messageId: '1' }),
      );
      expect(state).toMatchObject({
        status: 'error',
        reason: 'passkey-check-required',
        values: { messageId: '1' },
      });
      expect(mocks.deletePanel).not.toHaveBeenCalled();
    });

    it('asks users without a passkey to add one first', async () => {
      harness.passkeyCount = 0;
      harness.session = makeSession(harness.userId, null);
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel: '{}' }),
      );
      expect(state).toMatchObject({ status: 'error', reason: 'passkey-required' });
      expect(mocks.publish).not.toHaveBeenCalled();
    });
  });

  describe('publishReactionRolePanel', () => {
    it('posts a new panel and keeps the message ID in the form for the next save', async () => {
      mocks.publish.mockResolvedValue({
        status: 'published',
        created: true,
        messageId: '555',
        changes,
      });
      const panel = JSON.stringify({ channelId: '1', messageId: null, items: [] });
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel }),
      );
      expect(state).toEqual({
        status: 'saved',
        message: 'Panel posted.',
        values: { panel: JSON.stringify({ channelId: '1', messageId: '555', items: [] }) },
      });
      expect(mocks.publish).toHaveBeenCalledWith(GUILD_ID, panel, {
        userId: harness.userId,
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      });
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${GUILD_ID}/reaction-roles`);
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD_ID, {
        userId: harness.userId,
        module: 'reaction-roles',
        changes,
      });
    });

    it('says the panel was updated when it edited an existing message', async () => {
      mocks.publish.mockResolvedValue({
        status: 'published',
        created: false,
        messageId: '555',
        changes,
      });
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel: 'not json' }),
      );
      // Text that is not JSON is handed back as typed.
      expect(state).toEqual({
        status: 'saved',
        message: 'Panel updated.',
        values: { panel: 'not json' },
      });
    });

    it('turns schema errors into errors on the panel field', async () => {
      mocks.publish.mockResolvedValue({ status: 'invalid', errors: ['Role 2: Choose a role.'] });
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel: '{}' }),
      );
      expect(state).toEqual({
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: { panel: ['Role 2: Choose a role.'] },
        values: { panel: '{}' },
      });
      await flushAfter();
      expect(mocks.guildSettingsChanged).not.toHaveBeenCalled();
    });

    it('shows a panel refusal as the form message and lets other errors through', async () => {
      mocks.publish.mockRejectedValueOnce(new PanelError('Ririko cannot post in that channel.'));
      const state = await publishReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ panel: '{}' }),
      );
      expect(state).toEqual({
        status: 'error',
        message: 'Ririko cannot post in that channel.',
        values: { panel: '{}' },
      });
      mocks.publish.mockRejectedValueOnce(new Error('boom'));
      await expect(
        publishReactionRolePanel(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ panel: '{}' })),
      ).rejects.toThrow('boom');
    });
  });

  describe('removeReactionRoleBinding', () => {
    it('removes the role and announces it', async () => {
      mocks.removeBinding.mockResolvedValue(changes);
      const state = await removeReactionRoleBinding(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ bindingId: 'b1' }),
      );
      expect(state).toEqual({ status: 'saved', message: 'Role removed.', values: {} });
      expect(mocks.removeBinding).toHaveBeenCalledWith(
        GUILD_ID,
        'b1',
        expect.objectContaining({ userId: harness.userId }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledOnce();
    });

    it('shows refusals as the form message and lets other errors through', async () => {
      mocks.removeBinding.mockRejectedValueOnce(new PanelError('That role is already gone.'));
      expect(
        await removeReactionRoleBinding(
          GUILD_ID,
          INITIAL_SETTINGS_FORM_STATE,
          form({ bindingId: 'b1' }),
        ),
      ).toEqual({ status: 'error', message: 'That role is already gone.' });
      mocks.removeBinding.mockRejectedValueOnce(new Error('boom'));
      await expect(
        removeReactionRoleBinding(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({})),
      ).rejects.toThrow('boom');
    });
  });

  describe('deleteReactionRolePanel', () => {
    it('deletes the panel, and the message only when asked', async () => {
      mocks.deletePanel.mockResolvedValue(changes);
      const state = await deleteReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ messageId: '77', deleteMessage: 'true' }),
      );
      expect(state).toEqual({ status: 'saved', message: 'Panel deleted.', values: {} });
      expect(mocks.deletePanel).toHaveBeenLastCalledWith(
        GUILD_ID,
        '77',
        { deleteMessage: true },
        expect.objectContaining({ userId: harness.userId }),
      );
      await deleteReactionRolePanel(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ messageId: '77' }),
      );
      expect(mocks.deletePanel).toHaveBeenLastCalledWith(
        GUILD_ID,
        '77',
        { deleteMessage: false },
        expect.anything(),
      );
    });

    it('shows refusals as the form message and lets other errors through', async () => {
      mocks.deletePanel.mockRejectedValueOnce(new PanelError('Unknown panel.'));
      expect(
        await deleteReactionRolePanel(
          GUILD_ID,
          INITIAL_SETTINGS_FORM_STATE,
          form({ messageId: '1' }),
        ),
      ).toEqual({ status: 'error', message: 'Unknown panel.' });
      mocks.deletePanel.mockRejectedValueOnce(new Error('boom'));
      await expect(
        deleteReactionRolePanel(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({})),
      ).rejects.toThrow('boom');
    });
  });
});
