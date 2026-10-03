import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BACKGROUND_UPLOAD_BYTES } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { BackgroundUploadError } from '@ririko/services/welcomer-backgrounds';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  flushAfter,
  GUILD_ID,
  harness,
  resetHarness,
  revalidatePath,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  messageChannels: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  pruneUnused: vi.fn(),
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
      guildResources: { messageChannels: mocks.messageChannels },
      guildConfig: { update: mocks.update },
      welcomerBackgrounds: {
        upload: mocks.upload,
        remove: mocks.remove,
        pruneUnused: mocks.pruneUnused,
      },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { saveCardSettings, uploadCardBackground, removeCardBackground } = await import('./actions');

const CHANNEL = '200000000000000002';

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function image(bytes: number): File {
  return new File([new Uint8Array(bytes).fill(7)], 'bg.png', { type: 'image/png' });
}

describe('welcome and farewell card actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.messageChannels.mockResolvedValue([{ id: CHANNEL, name: 'welcome' }]);
  });

  describe('saveCardSettings', () => {
    it('rejects an unknown card without touching anything', async () => {
      const state = await saveCardSettings(
        GUILD_ID,
        'goodbye' as never,
        INITIAL_SETTINGS_FORM_STATE,
        form({}),
      );
      expect(state).toEqual({ status: 'error', message: 'Unknown card.' });
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('saves the card, reading an unticked toggle as off, and prunes unused uploads after', async () => {
      mocks.update.mockResolvedValue({
        values: { enabled: false },
        changes: [{ field: 'channelId', before: null, after: CHANNEL }],
      });
      const state = await saveCardSettings(
        GUILD_ID,
        'welcome',
        INITIAL_SETTINGS_FORM_STATE,
        form({ channelId: CHANNEL, messageTemplate: 'Hi {user}', textColor: '#ffffff' }),
      );
      expect(state).toMatchObject({ status: 'saved', message: 'Settings saved.' });
      expect(mocks.update).toHaveBeenCalledWith(
        GUILD_ID,
        'welcome',
        { channelId: CHANNEL, messageTemplate: 'Hi {user}', textColor: '#ffffff', enabled: false },
        expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
      );
      expect(mocks.pruneUnused).not.toHaveBeenCalled();
      await flushAfter();
      expect(mocks.pruneUnused).toHaveBeenCalledWith(GUILD_ID, 'welcome');
      expect(mocks.guildSettingsChanged).toHaveBeenCalled();
    });

    it('names the missing channel when the card is switched on without one', async () => {
      const state = await saveCardSettings(
        GUILD_ID,
        'farewell',
        INITIAL_SETTINGS_FORM_STATE,
        form({ enabled: 'on' }),
      );
      expect(state).toMatchObject({
        status: 'error',
        fieldErrors: { channelId: ['Choose a channel to turn the card on.'] },
      });
      expect(mocks.update).not.toHaveBeenCalled();
      await flushAfter();
      expect(mocks.pruneUnused).not.toHaveBeenCalled();
    });

    it('rejects a channel that is not a text channel of the server', async () => {
      const state = await saveCardSettings(
        GUILD_ID,
        'welcome',
        INITIAL_SETTINGS_FORM_STATE,
        form({ channelId: '999999999999999999' }),
      );
      expect(state).toMatchObject({
        status: 'error',
        fieldErrors: { channelId: ['Choose a text channel of this server.'] },
      });
    });

    it('turns schema errors into field errors and prunes nothing', async () => {
      mocks.update.mockRejectedValue(
        new GuildConfigValidationError({ textColor: ['Use a hex colour.'] }),
      );
      const state = await saveCardSettings(
        GUILD_ID,
        'welcome',
        INITIAL_SETTINGS_FORM_STATE,
        form({ channelId: CHANNEL, textColor: 'red' }),
      );
      expect(state).toMatchObject({
        status: 'error',
        fieldErrors: { textColor: ['Use a hex colour.'] },
      });
      await flushAfter();
      expect(mocks.pruneUnused).not.toHaveBeenCalled();
    });

    it('answers 404 for a guild the user cannot manage', async () => {
      harness.guildAccess = 'denied';
      await expect(
        saveCardSettings(GUILD_ID, 'welcome', INITIAL_SETTINGS_FORM_STATE, form({})),
      ).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('uploadCardBackground', () => {
    it('rejects an unknown card, another origin and a guild without access', async () => {
      expect(
        await uploadCardBackground(GUILD_ID, 'x' as never, INITIAL_SETTINGS_FORM_STATE, form({})),
      ).toEqual({ status: 'error', message: 'Unknown card.' });

      harness.headers = new Headers({ origin: 'https://evil.example' });
      expect(
        await uploadCardBackground(GUILD_ID, 'welcome', INITIAL_SETTINGS_FORM_STATE, form({})),
      ).toMatchObject({
        status: 'error',
        message: 'This request did not come from the dashboard.',
      });

      harness.headers = new Headers({ origin: 'https://dash.example.com' });
      harness.guildAccess = 'denied';
      await expect(
        uploadCardBackground(GUILD_ID, 'welcome', INITIAL_SETTINGS_FORM_STATE, form({})),
      ).rejects.toThrow('NOT_FOUND');
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('asks for an image when none or an empty one was chosen', async () => {
      const expected = { status: 'error', message: 'Choose an image to upload.' };
      expect(
        await uploadCardBackground(GUILD_ID, 'welcome', INITIAL_SETTINGS_FORM_STATE, form({})),
      ).toEqual(expected);
      expect(
        await uploadCardBackground(
          GUILD_ID,
          'welcome',
          INITIAL_SETTINGS_FORM_STATE,
          form({ background: image(0) }),
        ),
      ).toEqual(expected);
    });

    it('refuses an image over the size limit', async () => {
      const state = await uploadCardBackground(
        GUILD_ID,
        'welcome',
        INITIAL_SETTINGS_FORM_STATE,
        form({ background: image(MAX_BACKGROUND_UPLOAD_BYTES + 1) }),
      );
      expect(state).toEqual({ status: 'error', message: 'The image is larger than 2 MB.' });
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('stores the image bytes with the actor and announces the change', async () => {
      const state = await uploadCardBackground(
        GUILD_ID,
        'farewell',
        INITIAL_SETTINGS_FORM_STATE,
        form({ background: image(16) }),
      );
      expect(state).toEqual({ status: 'saved', message: 'Background uploaded.', values: {} });
      const [guildId, kind, bytes, actor] = mocks.upload.mock.calls[0]!;
      expect([guildId, kind]).toEqual([GUILD_ID, 'farewell']);
      expect(Buffer.isBuffer(bytes) && bytes.length === 16 && bytes.every((b) => b === 7)).toBe(
        true,
      );
      expect(actor).toEqual({
        userId: harness.userId,
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      });
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${GUILD_ID}/farewell`);
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD_ID, {
        userId: harness.userId,
        module: 'farewell',
        changes: [{ field: 'background', before: null, after: 'uploaded image' }],
      });
    });

    it('shows an invalid image as the form message and lets other errors through', async () => {
      mocks.upload.mockRejectedValueOnce(new BackgroundUploadError('That is not a PNG or JPEG.'));
      expect(
        await uploadCardBackground(
          GUILD_ID,
          'welcome',
          INITIAL_SETTINGS_FORM_STATE,
          form({ background: image(4) }),
        ),
      ).toEqual({ status: 'error', message: 'That is not a PNG or JPEG.' });
      mocks.upload.mockRejectedValueOnce(new Error('disk full'));
      await expect(
        uploadCardBackground(
          GUILD_ID,
          'welcome',
          INITIAL_SETTINGS_FORM_STATE,
          form({ background: image(4) }),
        ),
      ).rejects.toThrow('disk full');
    });
  });

  describe('removeCardBackground', () => {
    it('rejects an unknown card and another origin', async () => {
      expect(
        await removeCardBackground(GUILD_ID, 'x' as never, INITIAL_SETTINGS_FORM_STATE, form({})),
      ).toEqual({ status: 'error', message: 'Unknown card.' });
      harness.headers = new Headers({ origin: 'https://evil.example' });
      expect(
        await removeCardBackground(GUILD_ID, 'welcome', INITIAL_SETTINGS_FORM_STATE, form({})),
      ).toMatchObject({ status: 'error' });
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('resets to the default background and announces it', async () => {
      const state = await removeCardBackground(
        GUILD_ID,
        'welcome',
        INITIAL_SETTINGS_FORM_STATE,
        form({}),
      );
      expect(state).toEqual({ status: 'saved', message: 'Background removed.', values: {} });
      expect(mocks.remove).toHaveBeenCalledWith(
        GUILD_ID,
        'welcome',
        expect.objectContaining({ userId: harness.userId }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(
        GUILD_ID,
        expect.objectContaining({
          module: 'welcome',
          changes: [{ field: 'background', before: null, after: 'default' }],
        }),
      );
    });
  });
});
