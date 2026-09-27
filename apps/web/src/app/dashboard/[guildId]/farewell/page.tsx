import type { Metadata } from 'next';
import { WelcomerCardPage } from '../welcome/card-page';

export const metadata: Metadata = { title: 'Farewell Card · Ririko Dashboard' };

export default async function FarewellCardSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  return <WelcomerCardPage guildId={guildId} kind="farewell" />;
}
