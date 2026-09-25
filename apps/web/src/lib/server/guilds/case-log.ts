import 'server-only';
import type {
  ModerationCase,
  ModerationNote,
  ModerationRepository,
  ModerationWarning,
} from '@ririko/database';
import type { UserDirectory, UserSummary } from './user-directory';

export const CASES_PAGE_SIZE = 25;
const HISTORY_LIMIT = 20;
const DAY_MS = 86_400_000;
const SNOWFLAKE = /^\d{17,20}$/;
const CASE_TYPE = /^[A-Z_]{1,32}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface CaseLogFilters {
  /** Target user ID. */
  user?: string;
  moderator?: string;
  type?: string;
  /** First UTC day, `YYYY-MM-DD`. */
  from?: string;
  /** Last UTC day, inclusive. */
  to?: string;
  /** Cursor: show cases numbered below this. */
  before?: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : undefined;
}

function dayStart(day: string): Date | null {
  if (!DAY.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : date;
}

/** Reads the filter form. Invalid values are dropped and reported under their field. */
export function parseCaseLogFilters(params: SearchParams): {
  filters: CaseLogFilters;
  errors: Partial<Record<keyof CaseLogFilters, string>>;
} {
  const filters: CaseLogFilters = {};
  const errors: Partial<Record<keyof CaseLogFilters, string>> = {};

  for (const key of ['user', 'moderator'] as const) {
    const value = param(params, key);
    if (value === undefined) continue;
    if (SNOWFLAKE.test(value)) filters[key] = value;
    else errors[key] = 'Enter a Discord user ID (17 to 20 digits).';
  }

  const type = param(params, 'type')?.toUpperCase();
  if (type !== undefined) {
    if (CASE_TYPE.test(type)) filters.type = type;
    else errors.type = 'Unknown action.';
  }

  for (const key of ['from', 'to'] as const) {
    const value = param(params, key);
    if (value === undefined) continue;
    if (dayStart(value)) filters[key] = value;
    else errors[key] = 'Enter a date as YYYY-MM-DD.';
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    errors.to = 'The end date is before the start date.';
    delete filters.to;
  }

  const before = param(params, 'before');
  if (before !== undefined && /^\d{1,9}$/.test(before)) filters.before = Number(before);

  return { filters, errors };
}

/** Query string for the case log with these filters; `undefined` values are left out. */
export function caseLogQuery(filters: {
  [K in keyof CaseLogFilters]?: CaseLogFilters[K] | undefined;
}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export interface CaseRow {
  caseNumber: number;
  type: string;
  targetUserId: string;
  moderatorUserId: string;
  reason: string;
  durationSeconds: number | null;
  createdAt: string;
}

function toRow(c: ModerationCase): CaseRow {
  return {
    caseNumber: c.caseNumber,
    type: c.type,
    targetUserId: c.targetUserId,
    moderatorUserId: c.moderatorUserId,
    reason: c.reason,
    durationSeconds: c.durationSeconds,
    createdAt: c.createdAt.toISOString(),
  };
}

export interface CaseLogPage {
  cases: CaseRow[];
  /** Cases matching the filters, across all pages. */
  total: number;
  /** Cursor for the next (older) page, or null on the last page. */
  nextBefore: number | null;
  /** Case types this guild has used, for the action filter. */
  types: string[];
  users: Map<string, UserSummary>;
}

interface CaseLogDeps {
  moderation: Pick<
    ModerationRepository,
    'listCases' | 'listCaseTypes' | 'getCaseByNumber' | 'listWarnings' | 'getNotesByUser'
  >;
  users: Pick<UserDirectory, 'lookup'>;
}

/** One page of the case log. Callers must have passed `requireGuildAccess(guildId)`. */
export async function loadCaseLog(
  deps: CaseLogDeps,
  guildId: string,
  filters: CaseLogFilters,
): Promise<CaseLogPage> {
  const [result, types] = await Promise.all([
    deps.moderation.listCases(guildId, {
      targetUserId: filters.user,
      moderatorUserId: filters.moderator,
      type: filters.type,
      createdFrom: filters.from ? dayStart(filters.from)! : undefined,
      createdBefore: filters.to ? new Date(dayStart(filters.to)!.getTime() + DAY_MS) : undefined,
      beforeCaseNumber: filters.before,
      // One extra row tells whether an older page exists.
      limit: CASES_PAGE_SIZE + 1,
    }),
    deps.moderation.listCaseTypes(guildId),
  ]);
  const page = result.items.slice(0, CASES_PAGE_SIZE);
  const users = await deps.users.lookup(page.flatMap((c) => [c.targetUserId, c.moderatorUserId]));
  return {
    cases: page.map(toRow),
    total: result.total,
    nextBefore: result.items.length > CASES_PAGE_SIZE ? page.at(-1)!.caseNumber : null,
    types,
    users,
  };
}

export interface WarningRow {
  id: string;
  moderatorId: string;
  reason: string;
  severity: number;
  /** Counts toward escalation: active and not expired. */
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface NoteRow {
  id: string;
  authorUserId: string;
  content: string;
  createdAt: string;
}

export interface CaseDetail {
  case: CaseRow;
  metadata: Record<string, unknown>;
  /** The target's other cases, newest first. */
  history: CaseRow[];
  warnings: WarningRow[];
  notes: NoteRow[];
  users: Map<string, UserSummary>;
}

function toWarningRow(w: ModerationWarning, now: number): WarningRow {
  return {
    id: w.id,
    moderatorId: w.moderatorId,
    reason: w.reason,
    severity: w.severity,
    active: w.isActive && (!w.expiresAt || w.expiresAt.getTime() > now),
    expiresAt: w.expiresAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
  };
}

function toNoteRow(n: ModerationNote): NoteRow {
  return {
    id: n.id,
    authorUserId: n.authorUserId,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  };
}

/** A case with the target's warnings, notes and other cases, or null if it does not exist. */
export async function loadCaseDetail(
  deps: CaseLogDeps,
  guildId: string,
  caseNumber: number,
  now: number = Date.now(),
): Promise<CaseDetail | null> {
  const found = await deps.moderation.getCaseByNumber(guildId, caseNumber);
  if (!found) return null;
  const [history, warnings, notes] = await Promise.all([
    deps.moderation.listCases(guildId, {
      targetUserId: found.targetUserId,
      limit: HISTORY_LIMIT + 1,
    }),
    deps.moderation.listWarnings(guildId, found.targetUserId),
    deps.moderation.getNotesByUser(guildId, found.targetUserId),
  ]);
  const otherCases = history.items.filter((c) => c.id !== found.id).slice(0, HISTORY_LIMIT);
  const users = await deps.users.lookup([
    found.targetUserId,
    found.moderatorUserId,
    ...otherCases.map((c) => c.moderatorUserId),
    ...warnings.map((w) => w.moderatorId),
    ...notes.map((n) => n.authorUserId),
  ]);
  return {
    case: toRow(found),
    metadata: found.metadata ?? {},
    history: otherCases.map(toRow),
    warnings: warnings.map((w) => toWarningRow(w, now)),
    notes: notes.map(toNoteRow),
    users,
  };
}

/** `SOFTBAN` as `Softban`, `LOCKDOWN_END` as `Lockdown end`. */
export function caseTypeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase().replaceAll('_', ' ');
}

const DURATION_UNITS: [seconds: number, unit: string][] = [
  [86_400, 'day'],
  [3_600, 'hour'],
  [60, 'minute'],
  [1, 'second'],
];

/** `600` as `10 minutes`, `90000` as `1 day 1 hour`: the two largest units. */
export function formatDuration(seconds: number): string {
  const parts: string[] = [];
  let rest = Math.max(0, Math.round(seconds));
  for (const [size, unit] of DURATION_UNITS) {
    const count = Math.floor(rest / size);
    if (count === 0) continue;
    parts.push(`${count} ${unit}${count === 1 ? '' : 's'}`);
    rest -= count * size;
    if (parts.length === 2) break;
  }
  return parts.join(' ') || '0 seconds';
}
