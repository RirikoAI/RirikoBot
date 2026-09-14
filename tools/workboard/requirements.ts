import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Board } from './types.ts';

export type RequirementStatus = 'documented' | 'partial' | 'planned' | 'implemented';
export interface Requirement {
  id: string; title: string; status: RequirementStatus; tickets: string[];
  evidence: Array<{ path: string; kind: 'implementation' | 'test' | 'documentation'; note: string }>;
  gap: string;
}
export interface Requirements {
  version: 1;
  source: { path: string; originalSha256: string; normalizedSha256: string; sectionCount: number; origin: string };
  requirements: Requirement[];
  acceptance: Requirement[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Requirements: expected an object');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Requirements: expected nonempty text');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Requirements: expected an array');
  return value as unknown[];
}
function fields(value: Record<string, unknown>, names: string[]): void {
  if (Object.keys(value).some((name) => !names.includes(name)) || names.some((name) => !Object.hasOwn(value, name))) throw new Error('Requirements: missing or unknown fields');
}
function entry(value: unknown): Requirement {
  const record = object(value);
  fields(record, ['id', 'title', 'status', 'tickets', 'evidence', 'gap']);
  const status = string(record['status']);
  if (!['documented', 'partial', 'planned', 'implemented'].includes(status)) throw new Error(`Requirements: invalid status ${status}`);
  const evidence = array(record['evidence']).map((input) => {
    const item = object(input); fields(item, ['path', 'kind', 'note']);
    const kind = string(item['kind']);
    if (!['implementation', 'test', 'documentation'].includes(kind)) throw new Error(`Requirements: invalid evidence kind ${kind}`);
    return { path: string(item['path']), kind: kind as Requirement['evidence'][number]['kind'], note: string(item['note']) };
  });
  return { id: string(record['id']), title: string(record['title']), status: status as RequirementStatus, tickets: array(record['tickets']).map(string), evidence, gap: string(record['gap']) };
}

export function parseRequirements(value: unknown): Requirements {
  const input = object(value); fields(input, ['version', 'source', 'requirements', 'acceptance']);
  if (input['version'] !== 1) throw new Error('Requirements: unsupported version');
  const source = object(input['source']); fields(source, ['path', 'originalSha256', 'normalizedSha256', 'sectionCount', 'origin']);
  const sectionCount = source['sectionCount'];
  if (sectionCount !== 91 || source['path'] !== 'BLUEPRINT.md') throw new Error('Requirements: preserve all 91 numbered sections of BLUEPRINT.md');
  for (const key of ['originalSha256', 'normalizedSha256']) if (!/^[a-f0-9]{64}$/.test(string(source[key]))) throw new Error('Requirements: invalid source hash');
  return { version: 1, source: { path: 'BLUEPRINT.md', originalSha256: string(source['originalSha256']), normalizedSha256: string(source['normalizedSha256']), sectionCount, origin: string(source['origin']) }, requirements: array(input['requirements']).map(entry), acceptance: array(input['acceptance']).map(entry) };
}

export function normalizedHash(text: string): string { return createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex'); }

/** Completeness and evidence-reference checks; these never claim a linked test actually passed. */
export function validateRequirements(data: Requirements, blueprint: string, board: Board, exists: (path: string) => boolean): string[] {
  const errors: string[] = [];
  if (normalizedHash(blueprint) !== data.source.normalizedSha256) errors.push('Blueprint content changed from the preserved user request');
  const sections = [...blueprint.matchAll(/^# (\d+)\. (.+?)\r?$/gm)];
  const expected = sections.map((match) => ({ id: `BP-${String(match[1]).padStart(2, '0')}`, title: match[2] ?? '' }));
  if (sections.length !== 91 || sections.some((match, index) => Number(match[1]) !== index)) errors.push('Blueprint must retain sections 0 through 90 exactly once in order');
  const finalSection = sections.find((match) => match[1] === '86');
  const nextSection = sections.find((match) => match[1] === '87');
  const criteria = blueprint.slice(finalSection?.index, nextSection?.index).split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line, index) => ({ id: `AC-${String(index + 1).padStart(2, '0')}`, title: line.slice(2) }));
  for (const [entries, originals] of [[data.requirements, expected], [data.acceptance, criteria]] as const) {
    if (entries.length !== originals.length || new Set(entries.map((item) => item.id)).size !== entries.length) errors.push('Requirement IDs must cover the original list once, without omissions or duplicates');
    for (const original of originals) {
      const item = entries.find((candidate) => candidate.id === original.id);
      if (!item || item.title !== original.title) errors.push(`Missing or changed requirement: ${original.id}`);
    }
    for (const item of entries) {
      if (!originals.some((original) => original.id === item.id)) errors.push(`Unknown requirement ${item.id}`);
      if (!item.tickets.length || new Set(item.tickets).size !== item.tickets.length || item.tickets.some((id) => !board.tickets.some((ticket) => ticket.id === id))) errors.push(`${item.id}: link existing, nonduplicate backlog/delivery scopes`);
      if (!item.evidence.length) errors.push(`${item.id}: provide a source, test or design reference`);
      if (item.status === 'implemented' && (!item.evidence.some((link) => link.kind === 'implementation') || !item.evidence.some((link) => link.kind === 'test'))) errors.push(`${item.id}: implemented claims need implementation and test evidence, not just documentation`);
      for (const link of item.evidence) {
        if (link.kind === 'test' && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(link.path)) errors.push(`${item.id}: test evidence must reference an executable test file`);
        if (link.kind === 'implementation' && (link.path.endsWith('.md') || link.path.startsWith('docs/'))) errors.push(`${item.id}: documentation is not implementation evidence`);
        if (/^(?:[./\\]|[A-Za-z]:)/.test(link.path) && !link.path.startsWith('.workboard/') && !link.path.startsWith('.github/') && !link.path.startsWith('.gemini/')) errors.push(`${item.id}: evidence must be a repository-relative file`);
        if (link.path.includes('\\') || link.path.split('/').some((part) => ['..', '.', '.local', '.audit', 'node_modules'].includes(part)) || !exists(link.path)) errors.push(`${item.id}: missing or unsafe evidence ${link.path}`);
      }
    }
  }
  return errors;
}

export function readRequirements(root: string, board: Board): Requirements {
  const data = parseRequirements(JSON.parse(readFileSync(resolve(root, 'docs/requirements.json'), 'utf8')) as unknown);
  const blueprint = readFileSync(resolve(root, data.source.path), 'utf8');
  const errors = validateRequirements(data, blueprint, board, (path) => {
    try {
      const distance = relative(realpathSync(root), realpathSync(resolve(root, path)));
      return !isAbsolute(distance) && distance !== '..' && !distance.startsWith(`..${sep}`) && readFileSync(resolve(root, path)).length > 0;
    } catch { return false; }
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return data;
}

export function renderRequirements(data: Requirements): string {
  const cell = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const rows = (entries: Requirement[]): string[] => entries.map((item) => `| ${item.id} | ${cell(item.title)} | ${item.status} | ${item.tickets.join(', ')} | ${cell(item.gap)} |`);
  const counts = (entries: Requirement[]): string => ['implemented', 'documented', 'partial', 'planned'].map((status) => `${entries.filter((item) => item.status === status).length} ${status}`).join(' · ');
  return ['# Blueprint requirement coverage', '',
    'Generated from [requirements.json](requirements.json) against the preserved [user blueprint](../BLUEPRINT.md). See [the branch comparison](branch-comparison.md) and [work board](../.workboard/BOARD.md).', '',
    '**These are section/acceptance classifications, not a percentage of product completion.** `documented` means an artifact or rule exists; `partial` means only the stated subset exists; `planned` means implementation is pending. `implemented` needs code and test references, but the validator does not run those tests or prove live behavior. Every gap remains explicit.', '',
    `Source: ${data.source.origin}. Original attachment SHA-256: \`${data.source.originalSha256}\`. Validation normalizes CRLF/LF only, so clones preserve text across operating systems. Blueprint amendments need explicit user direction and a reviewed provenance update; do not silently change the source to make a check pass.`, '',
    `**91 sections:** ${counts(data.requirements)}.`, '', '| ID | Original requirement | Status | Owning backlog scope | Remaining work / evidence boundary |', '|---|---|---|---|---|', ...rows(data.requirements), '',
    `## Final acceptance checklist (${data.acceptance.length})`, '', counts(data.acceptance), '', '| ID | Original acceptance criterion | Status | Owning backlog scope | Remaining work / evidence boundary |', '|---|---|---|---|---|', ...rows(data.acceptance), '',
    'Inspect the implementation/test/design file references and notes with `pnpm board requirements-show BP-11` (or an `AC-` ID). Run `pnpm board requirements-check` after changing requirements, evidence paths or the board. The manifest maps sections and the exact final checklist; detailed feature behavior still belongs to each requirement’s full blueprint text, source inventory and groomed ticket acceptance.', ''].join('\n');
}
