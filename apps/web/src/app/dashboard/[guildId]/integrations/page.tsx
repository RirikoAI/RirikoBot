import type { Metadata } from 'next';
import { INTEGRATION_GROUPS, integrationStatus } from '@ririko/core';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Integrations · Ririko Dashboard' };

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { config } = await getWebServices();
  // Only whether each integration is set up reaches the page, never a configured value.
  const statuses = integrationStatus(config);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Third-party services this Ririko bot is set up to use. They are the same on every server,
          and only the bot operator can change them. Keys and tokens are never shown.
        </p>
      </header>
      {INTEGRATION_GROUPS.map((group) => (
        <section key={group} className="rounded-md border border-edge bg-panel p-4">
          <h2 className="text-base font-semibold text-zinc-100">{group}</h2>
          <ul className="mt-3 flex flex-col divide-y divide-edge">
            {statuses
              .filter((status) => status.group === group)
              .map((status) => (
                <li
                  key={status.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                >
                  <div>
                    <p className="text-sm text-zinc-100">{status.label}</p>
                    {status.note ? <p className="text-xs text-zinc-400">{status.note}</p> : null}
                  </div>
                  <p
                    className={
                      status.configured
                        ? 'text-sm font-medium text-emerald-300'
                        : 'text-sm text-zinc-400'
                    }
                  >
                    {status.configured ? 'Configured ✓' : 'Not configured'}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
