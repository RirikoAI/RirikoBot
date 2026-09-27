import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/server/auth/session';

export default async function OwnerHomePage() {
  await requireOwner('/owner');
  redirect('/owner/economy');
}
