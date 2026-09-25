import { redirect } from 'next/navigation';
import { GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';

export default async function GuildDashboardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // The layout has already run requireGuildAccess for this guild.
  redirect(`/dashboard/${guildId}/${GUILD_NAV_ITEMS[0].slug}`);
}
