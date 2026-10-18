import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LocalTime } from '@/components/local-time';
import { UserLabel } from '@/components/user-label';
import {
  caseLogQuery,
  caseTypeLabel,
  formatDuration,
  loadCaseDetail,
} from '@/lib/server/guilds/case-log';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Case · Ririko Dashboard' };

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-edge bg-panel p-4">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

function metadataValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ guildId: string; caseNumber: string }>;
}) {
  const { guildId, caseNumber } = await params;
  await requireGuildAccess(guildId);
  if (!/^\d{1,9}$/.test(caseNumber)) notFound();
  const { moderation, userDirectory } = await getWebServices();
  const detail = await loadCaseDetail(
    { moderation, users: userDirectory },
    guildId,
    Number(caseNumber),
  );
  if (!detail) notFound();

  const { case: c, users } = detail;
  const base = `/dashboard/${guildId}/cases`;
  const metadataEntries = Object.entries(detail.metadata);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <Link href={base} className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Case log
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Case #{c.caseNumber} · {caseTypeLabel(c.type)}
        </h1>
      </header>

      <Card title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-zinc-400">Member</dt>
          <dd className="min-w-0">
            <UserLabel id={c.targetUserId} users={users} />
            <span className="ml-2 font-mono text-xs text-zinc-500">{c.targetUserId}</span>
          </dd>
          <dt className="text-zinc-400">Moderator</dt>
          <dd className="min-w-0">
            <UserLabel id={c.moderatorUserId} users={users} />
          </dd>
          <dt className="text-zinc-400">Reason</dt>
          <dd className="break-words whitespace-pre-wrap">{c.reason}</dd>
          {c.durationSeconds ? (
            <>
              <dt className="text-zinc-400">Duration</dt>
              <dd>{formatDuration(c.durationSeconds)}</dd>
            </>
          ) : null}
          <dt className="text-zinc-400">When</dt>
          <dd>
            <LocalTime value={c.createdAt} />
          </dd>
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-zinc-400">{key}</dt>
              <dd className="font-mono text-xs break-all">{metadataValue(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`Warnings for this member (${detail.warnings.length})`}>
        {detail.warnings.length === 0 ? (
          <p className="text-zinc-400">No warnings.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.warnings.map((w) => (
              <li key={w.id} className="border-t border-edge pt-3 first:border-0 first:pt-0">
                <p className="break-words">{w.reason}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span className={w.active ? 'text-amber-300' : undefined}>
                    {w.active ? '● Counts toward escalation' : '○ No longer counts'}
                  </span>
                  <span>Severity {w.severity}</span>
                  <UserLabel id={w.moderatorId} users={users} />
                  <LocalTime value={w.createdAt} />
                  {w.expiresAt ? (
                    <span>
                      Expires <LocalTime value={w.expiresAt} />
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Staff notes (${detail.notes.length})`}>
        {detail.notes.length === 0 ? (
          <p className="text-zinc-400">No notes.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.notes.map((note) => (
              <li key={note.id} className="border-t border-edge pt-3 first:border-0 first:pt-0">
                <p className="break-words whitespace-pre-wrap">{note.content}</p>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <UserLabel id={note.authorUserId} users={users} />
                  <LocalTime value={note.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Other cases for this member">
        {detail.history.length === 0 ? (
          <p className="text-zinc-400">None.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {detail.history.map((other) => (
                <li key={other.caseNumber} className="flex flex-wrap gap-x-3">
                  <Link
                    href={`${base}/${other.caseNumber}`}
                    className="font-semibold text-sakura hover:underline"
                  >
                    #{other.caseNumber}
                  </Link>
                  <span>{caseTypeLabel(other.type)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400">{other.reason}</span>
                  <span className="text-zinc-400">
                    <LocalTime value={other.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={`${base}${caseLogQuery({ user: c.targetUserId })}`}
              className="mt-3 inline-block text-zinc-400 hover:text-zinc-200"
            >
              All cases for this member →
            </Link>
          </>
        )}
      </Card>
    </section>
  );
}
