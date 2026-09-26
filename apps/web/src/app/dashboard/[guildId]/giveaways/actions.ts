'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { GiveawayError, MAX_REROLL_WINNERS } from '@/lib/server/guilds/giveaways';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

/** The dashboard request check and guild access; returns the actor or the refusal. */
async function authorize(guildId: string) {
  const rejected = await checkDashboardRequest();
  if (rejected) return { refused: { status: 'error', message: rejected } as SettingsFormState };
  const { session } = await requireGuildAccess(guildId);
  return { actor: { userId: session.userId, ...(await requestActor()) } };
}

/** After a change: the log channel notice (after the response) and a fresh page. */
async function announce(guildId: string, userId: string, field: string, winnerIds: string[]) {
  const { notifier } = await getWebServices();
  const change = {
    userId,
    module: 'giveaways',
    changes: [{ field, before: [], after: winnerIds }],
  };
  after(() => notifier.guildSettingsChanged(guildId, change));
  revalidatePath(`/dashboard/${guildId}/giveaways`);
}

function winnersText(winnerIds: string[]): string {
  return winnerIds.length === 1 ? '1 winner' : `${winnerIds.length} winners`;
}

/** Ends a running giveaway now and announces its winners in its channel. */
export async function endGiveaway(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const auth = await authorize(guildId);
  if (auth.refused) return auth.refused;
  const giveawayId = String(formData.get('giveawayId') ?? '');

  const { giveaways } = await getWebServices();
  try {
    const { prize, winnerIds } = await giveaways.end(guildId, giveawayId, auth.actor);
    await announce(guildId, auth.actor.userId, `winners of ${prize}`, winnerIds);
    return {
      status: 'saved',
      message:
        winnerIds.length > 0
          ? `Giveaway ended with ${winnersText(winnerIds)}.`
          : 'Giveaway ended. Nobody could win: there were no eligible entries.',
      values: {},
    };
  } catch (error) {
    if (error instanceof GiveawayError) return { status: 'error', message: error.message };
    throw error;
  }
}

/** Draws new winners for an ended giveaway and announces them in its channel. */
export async function rerollGiveaway(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const auth = await authorize(guildId);
  if (auth.refused) return auth.refused;
  const giveawayId = String(formData.get('giveawayId') ?? '');
  const countText = String(formData.get('count') ?? '').trim();
  const count = countText === '' ? null : Number(countText);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > MAX_REROLL_WINNERS)) {
    return {
      status: 'error',
      message: `Enter a whole number of winners from 1 to ${MAX_REROLL_WINNERS}, or leave it empty.`,
      fieldErrors: { count: [`Enter a whole number from 1 to ${MAX_REROLL_WINNERS}.`] },
      values: { giveawayId, count: countText },
    };
  }

  const { giveaways } = await getWebServices();
  try {
    const { prize, winnerIds, posted } = await giveaways.reroll(
      guildId,
      giveawayId,
      count,
      auth.actor,
    );
    await announce(guildId, auth.actor.userId, `rerolled winners of ${prize}`, winnerIds);
    return {
      status: 'saved',
      message: posted
        ? `Rerolled: ${winnersText(winnerIds)} announced in the giveaway's channel.`
        : `Rerolled ${winnersText(winnerIds)}, but Ririko could not post in the giveaway's channel.`,
      values: {},
    };
  } catch (error) {
    if (error instanceof GiveawayError) return { status: 'error', message: error.message };
    throw error;
  }
}
