import type { Metadata } from 'next';
import Link from 'next/link';
import { LocalTime } from '@/components/local-time';
import { UserLabel } from '@/components/user-label';
import { numberFormat } from '@/lib/chart-format';
import {
  caseLogQuery,
  caseTypeLabel,
  formatDuration,
  loadCaseLog,
  parseCaseLogFilters,
  type CaseLogFilters,
} from '@/lib/server/guilds/case-log';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Case Log · Ririko Dashboard' };

const INPUT =
  'w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-sakura aria-invalid:border-red-500';

function FilterField({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`filter-${name}`} className="text-sm text-zinc-300">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`filter-${name}-error`} className="text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default async function CaseLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { filters, errors } = parseCaseLogFilters(await searchParams);
  const { moderation, userDirectory } = await getWebServices();
  const page = await loadCaseLog({ moderation, users: userDirectory }, guildId, filters);
  const base = `/dashboard/${guildId}/cases`;
  const filtered = { ...filters, before: undefined };
  const hasFilters = Object.values(filtered).some((value) => value !== undefined);
  const withFilter = (change: Partial<CaseLogFilters>) =>
    `${base}${caseLogQuery({ ...filtered, ...change })}`;
  const invalid = (key: keyof CaseLogFilters) =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `filter-${key}-error` } : {};

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Case Log</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every moderation action recorded in this server, newest first. Read only: cases are
          created by moderation commands and AutoMod.
        </p>
      </header>

      <form
        method="get"
        action={base}
        className="grid gap-3 rounded-md border border-edge p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <FilterField name="user" label="Member (user ID)" error={errors.user}>
          <input
            id="filter-user"
            name="user"
            inputMode="numeric"
            defaultValue={filters.user ?? ''}
            className={INPUT}
            {...invalid('user')}
          />
        </FilterField>
        <FilterField name="moderator" label="Moderator (user ID)" error={errors.moderator}>
          <input
            id="filter-moderator"
            name="moderator"
            inputMode="numeric"
            defaultValue={filters.moderator ?? ''}
            className={INPUT}
            {...invalid('moderator')}
          />
        </FilterField>
        <FilterField name="type" label="Action" error={errors.type}>
          <select
            id="filter-type"
            name="type"
            defaultValue={filters.type ?? ''}
            className={INPUT}
            {...invalid('type')}
          >
            <option value="">Any action</option>
            {page.types.map((type) => (
              <option key={type} value={type}>
                {caseTypeLabel(type)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField name="from" label="From (UTC)" error={errors.from}>
          <input
            id="filter-from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ''}
            className={INPUT}
            {...invalid('from')}
          />
        </FilterField>
        <FilterField name="to" label="To (UTC)" error={errors.to}>
          <input
            id="filter-to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ''}
            className={INPUT}
            {...invalid('to')}
          />
        </FilterField>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura"
          >
            Filter
          </button>
          {hasFilters ? (
            <Link href={base} className="text-sm text-zinc-400 hover:text-zinc-200">
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-zinc-400">
        {numberFormat.format(page.total)} {page.total === 1 ? 'case' : 'cases'}
        {hasFilters ? ' match these filters' : ''}.
      </p>

      {page.cases.length === 0 ? (
        <p className="rounded-md border border-edge p-4 text-sm text-zinc-400">
          {hasFilters ? 'No cases match these filters.' : 'No moderation cases yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-edge">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-panel text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-normal">Case</th>
                <th className="px-3 py-2 font-normal">Action</th>
                <th className="px-3 py-2 font-normal">Member</th>
                <th className="px-3 py-2 font-normal">Moderator</th>
                <th className="px-3 py-2 font-normal">Reason</th>
                <th className="px-3 py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {page.cases.map((c) => (
                <tr key={c.caseNumber} className="border-t border-edge align-top">
                  <td className="px-3 py-2">
                    <Link
                      href={`${base}/${c.caseNumber}`}
                      className="font-semibold text-sakura hover:underline"
                    >
                      #{c.caseNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {caseTypeLabel(c.type)}
                    {c.durationSeconds ? (
                      <span className="block text-xs text-zinc-400">
                        {formatDuration(c.durationSeconds)}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-40 px-3 py-2">
                    <Link
                      href={withFilter({ user: c.targetUserId })}
                      title="Show this member's cases"
                    >
                      <UserLabel id={c.targetUserId} users={page.users} />
                    </Link>
                  </td>
                  <td className="max-w-40 px-3 py-2">
                    <UserLabel id={c.moderatorUserId} users={page.users} />
                  </td>
                  <td className="max-w-64 px-3 py-2 break-words text-zinc-300">{c.reason}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                    <LocalTime value={c.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Case log pages" className="flex justify-between text-sm">
        {filters.before !== undefined ? (
          <Link href={withFilter({})} className="text-zinc-400 hover:text-zinc-200">
            ← Newest cases
          </Link>
        ) : (
          <span />
        )}
        {page.nextBefore !== null ? (
          <Link
            href={withFilter({ before: page.nextBefore })}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Older cases →
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
