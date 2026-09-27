import type { Metadata } from 'next';
import Link from 'next/link';
import { MAX_GAME_WAGER_LIMIT, WAGER_GAME_COMMANDS } from '@ririko/core';
import { SettingsForm, TextField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveGameSettings } from './actions';
import { GameRulesField } from './game-rules-field';

export const metadata: Metadata = { title: 'Games · Ririko Dashboard' };

export default async function GameSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig, commandCatalog } = await getWebServices();
  const [values, commands, catalog] = await Promise.all([
    guildConfig.get(guildId, 'games'),
    guildConfig.get(guildId, 'commands'),
    commandCatalog.list(),
  ]);
  // Server rules that only the Commands page shows: roles, or a rule for one channel.
  const hasOtherRules = (command: string) =>
    commands.overrides.some(
      (row) =>
        row.command === command &&
        (row.channelId !== null || row.allowedRoleIds.length > 0 || row.blockedRoleIds.length > 0),
    );
  const games = WAGER_GAME_COMMANDS.map((command) => {
    const entry = catalog.find((item) => item.name === command);
    return {
      command,
      description: entry?.description ?? '',
      cooldownSeconds: entry?.cooldownSeconds ?? 0,
      hasOtherRules: hasOtherRules(command),
    };
  });

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Games</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Mini-games members can play with an optional credits wager.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        <p>
          Credits are shared across every server, so a maximum wager here only limits what members
          can stake in this server.
        </p>
        <p>
          To limit a game to certain roles or channels, use the{' '}
          <Link href={`/dashboard/${guildId}/commands`} className="text-sakura hover:underline">
            Commands
          </Link>{' '}
          page. Members with Manage Server ignore the on/off rules.
        </p>
      </div>
      <SettingsForm action={saveGameSettings.bind(null, guildId)}>
        <TextField
          name="maxWager"
          label="Maximum wager (credits)"
          description={`Largest wager a member can place on one game. Empty means no limit. At most ${MAX_GAME_WAGER_LIMIT.toLocaleString('en-US')}.`}
          defaultValue={values.maxWager === null ? '' : String(values.maxWager)}
        />
        <GameRulesField games={games} defaultValue={values.rules} />
      </SettingsForm>
    </section>
  );
}
