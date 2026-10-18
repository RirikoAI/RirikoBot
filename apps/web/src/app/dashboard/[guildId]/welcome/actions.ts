'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { MAX_BACKGROUND_UPLOAD_BYTES, type WelcomerCardKind } from '@ririko/core';
import { BackgroundUploadError } from '@ririko/services/welcomer-backgrounds';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

const KINDS: readonly WelcomerCardKind[] = ['welcome', 'farewell'];

/**
 * Errors for a channel that is not a text channel of the guild, or a card that is on without
 * one. Where a background link points is checked by `GuildConfigService`, for the CLI too.
 */
async function checkCard(guildId: string, patch: Record<string, unknown>) {
  const { guildResources } = await getWebServices();
  const errors = await checkMessageChannel(guildResources, guildId, 'channelId', patch);
  if (patch.enabled === true && !patch.channelId) {
    errors.channelId = ['Choose a channel to turn the card on.'];
  }
  return errors;
}

/** Saves a card's settings; a link replaces an uploaded background, whose file is deleted. */
export async function saveCardSettings(
  guildId: string,
  kind: WelcomerCardKind,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  if (!KINDS.includes(kind)) return { status: 'error', message: 'Unknown card.' };
  const state = await saveGuildSettings(
    guildId,
    kind,
    readFormFields(formData, {
      text: ['channelId', 'messageTemplate', 'textColor', 'backgroundUrl', 'textMessage'],
      flag: ['enabled', 'textMessageEnabled'],
    }),
    { check: (patch) => checkCard(guildId, patch) },
  );
  if (state.status === 'saved') {
    const { welcomerBackgrounds } = await getWebServices();
    after(() => welcomerBackgrounds.pruneUnused(guildId, kind));
  }
  return state;
}

/** The dashboard request check and guild access; returns the actor or the refusal. */
async function authorize(guildId: string) {
  const rejected = await checkDashboardRequest();
  if (rejected) return { refused: { status: 'error', message: rejected } as SettingsFormState };
  const { session } = await requireGuildAccess(guildId);
  return { actor: { userId: session.userId, ...(await requestActor()) } };
}

/** After a change: the log channel notice (after the response) and a fresh page. */
async function announce(guildId: string, userId: string, kind: WelcomerCardKind, next: string) {
  const { notifier } = await getWebServices();
  const change = {
    userId,
    module: kind,
    changes: [{ field: 'background', before: null, after: next }],
  };
  after(() => notifier.guildSettingsChanged(guildId, change));
  revalidatePath(`/dashboard/${guildId}/${kind}`);
}

/** Uploads a background image for the card, replacing its link or previous upload. */
export async function uploadCardBackground(
  guildId: string,
  kind: WelcomerCardKind,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  if (!KINDS.includes(kind)) return { status: 'error', message: 'Unknown card.' };
  const auth = await authorize(guildId);
  if (auth.refused) return auth.refused;

  const file = formData.get('background');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose an image to upload.' };
  }
  if (file.size > MAX_BACKGROUND_UPLOAD_BYTES) {
    return {
      status: 'error',
      message: `The image is larger than ${MAX_BACKGROUND_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const { welcomerBackgrounds } = await getWebServices();
  try {
    await welcomerBackgrounds.upload(
      guildId,
      kind,
      Buffer.from(await file.arrayBuffer()),
      auth.actor,
    );
  } catch (error) {
    if (error instanceof BackgroundUploadError) return { status: 'error', message: error.message };
    throw error;
  }
  await announce(guildId, auth.actor.userId, kind, 'uploaded image');
  return { status: 'saved', message: 'Background uploaded.', values: {} };
}

/** Removes the card's background, back to the default one. */
export async function removeCardBackground(
  guildId: string,
  kind: WelcomerCardKind,
  _previous: SettingsFormState,
  _formData: FormData,
): Promise<SettingsFormState> {
  if (!KINDS.includes(kind)) return { status: 'error', message: 'Unknown card.' };
  const auth = await authorize(guildId);
  if (auth.refused) return auth.refused;

  const { welcomerBackgrounds } = await getWebServices();
  await welcomerBackgrounds.remove(guildId, kind, auth.actor);
  await announce(guildId, auth.actor.userId, kind, 'default');
  return { status: 'saved', message: 'Background removed.', values: {} };
}
