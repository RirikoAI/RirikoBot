import type { Metadata } from 'next';
import { WelcomerCardPage } from './card-page';

export const metadata: Metadata = { title: 'Welcome Card · Ririko Dashboard' };

export default async function WelcomeCardSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  return <WelcomerCardPage guildId={guildId} kind="welcome" />;
}
