import type { Metadata } from 'next';
import Link from 'next/link';
import { LocalTime } from '@/components/local-time';
import { UserLabel } from '@/components/user-label';
import { loadAuditLog, parseAuditCursor } from '@/lib/server/guilds/audit-log';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Audit Log · Ririko Dashboard' };

const SOURCE_LABELS: Record<string, string> = { dashboard: 'Dashboard', cli: 'CLI' };

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const before = parseAuditCursor((await searchParams).before);
  const { audit, userDirectory, guildResources } = await getWebServices();
  const page = await loadAuditLog(
    { audit, users: userDirectory, resources: guildResources },
    guildId,
    before,
  );
  const base = `/dashboard/${guildId}/audit-log`;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Settings changes made for this server from the dashboard or the <code>ririko</code> CLI,
          newest first, with the value before and after each change.
        </p>
      </header>

      {page.entries.length === 0 ? (
        <p className="rounded-md border border-edge p-4 text-sm text-zinc-400">
          {before ? 'No older changes.' : 'No settings have been changed yet.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {page.entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-edge bg-panel p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-zinc-100">{entry.summary}</span>
                <UserLabel id={entry.actorUserId} users={page.users} />
                {entry.source ? (
                  <span className="rounded-full border border-edge px-2 text-xs text-zinc-400">
                    {SOURCE_LABELS[entry.source] ?? entry.source}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-zinc-400">
                  <LocalTime value={entry.createdAt} />
                </span>
              </div>
              {entry.changes.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left">
                    <thead className="text-xs text-zinc-400">
                      <tr>
                        <th className="w-1/4 py-1 pr-3 font-normal">Setting</th>
                        <th className="py-1 pr-3 font-normal">Before</th>
                        <th className="py-1 font-normal">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.changes.map((change) => (
                        <tr key={change.field} className="border-t border-edge align-top">
                          <td className="py-1 pr-3 text-zinc-300">{change.field}</td>
                          <td className="py-1 pr-3 break-all text-zinc-400">
                            <del className="no-underline">{change.before}</del>
                          </td>
                          <td className="py-1 break-all text-zinc-100">
                            <ins className="no-underline">{change.after}</ins>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <nav aria-label="Audit log pages" className="flex justify-between text-sm">
        {before ? (
          <Link href={base} className="text-zinc-400 hover:text-zinc-200">
            ← Newest changes
          </Link>
        ) : (
          <span />
        )}
        {page.nextBefore ? (
          <Link
            href={`${base}?before=${encodeURIComponent(page.nextBefore)}`}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Older changes →
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
