import type { Metadata } from 'next';
import { numberFormat } from '@/lib/chart-format';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'TCG Achievements · Ririko Dashboard' };

/** Read-only: how many of this server's members unlocked and claimed each achievement. */
export default async function GuildTcgAchievementsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { tcgAchievements } = await getWebServices();
  const { members, achievements } = await tcgAchievements.guildCompletion(guildId);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">TCG Achievements</h1>
        <p className="mt-1 text-sm text-zinc-400">
          How many members of this server unlocked and claimed each Waifu TCG achievement. Members
          are the {numberFormat.format(members)} {members === 1 ? 'person' : 'people'} who have
          earned XP here. Achievements are the same on every server and are set by the bot owner.
          Read only.
        </p>
      </header>

      {achievements.length === 0 ? (
        <p className="rounded-md border border-edge p-4 text-sm text-zinc-400">
          No achievements yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-edge">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-panel text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-normal">Achievement</th>
                <th className="px-3 py-2 font-normal">Tier</th>
                <th className="px-3 py-2 text-right font-normal">Unlocked</th>
                <th className="px-3 py-2 text-right font-normal">Claimed</th>
              </tr>
            </thead>
            <tbody>
              {achievements.map(({ achievement, tracked, unlocked, claimed }) => (
                <tr key={achievement.id} className="border-t border-edge">
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {achievement.badgeIcon ? `${achievement.badgeIcon} ` : ''}
                      {achievement.title}
                    </p>
                    <p className="text-xs text-zinc-400">{achievement.description}</p>
                    {tracked ? null : (
                      <p className="text-xs text-amber-300">
                        Progress is not tracked yet, so nobody can unlock this one.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{achievement.tier}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {numberFormat.format(unlocked)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {numberFormat.format(claimed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
