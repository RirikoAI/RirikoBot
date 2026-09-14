import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from './model.ts';
import { normalizedHash, parseRequirements, readRequirements, renderRequirements, validateRequirements } from './requirements.ts';
import { renderBoard } from './render.ts';

const root = new URL('../../', import.meta.url);
const blueprint = readFileSync(new URL('BLUEPRINT.md', root), 'utf8');
const board = parseBoard(JSON.parse(readFileSync(new URL('.workboard/state.json', root), 'utf8')) as unknown);
const source: unknown = JSON.parse(readFileSync(new URL('docs/requirements.json', root), 'utf8'));
const fixture = () => parseRequirements(source);

describe('blueprint traceability and review evidence', () => {
  it('covers all sections and final criteria with actual local evidence paths', () => {
    const data = readRequirements(process.cwd(), board);
    expect(data.requirements).toHaveLength(91);
    expect(data.acceptance).toHaveLength(35);
    expect(validateRequirements(data, blueprint, board, () => true)).toEqual([]);
    expect(renderRequirements(data)).toContain('not a percentage of product completion');
  });
  it('preserves content across line endings, rejecting altered requirements', () => {
    const lf = blueprint.replaceAll('\r\n', '\n');
    expect(normalizedHash(lf)).toBe(normalizedHash(lf.replaceAll('\n', '\r\n')));
    expect(validateRequirements(fixture(), blueprint.replace('Facebook', 'YouTube'), board, () => true)).toContain('Blueprint content changed from the preserved user request');
  });
  it('rejects missing, duplicate, renamed or invented sections and final criteria', () => {
    const missing = fixture(); missing.requirements.pop();
    expect(validateRequirements(missing, blueprint, board, () => true).join('\n')).toContain('Missing or changed requirement: BP-90');
    const duplicate = fixture(); duplicate.acceptance[1] = structuredClone(duplicate.acceptance[0]!);
    expect(validateRequirements(duplicate, blueprint, board, () => true).join('\n')).toContain('without omissions or duplicates');
    const changed = fixture(); changed.requirements[18]!.title = 'Invent a different platform set';
    expect(validateRequirements(changed, blueprint, board, () => true).join('\n')).toContain('Missing or changed requirement: BP-18');
  });
  it('rejects nonexistent scope links and missing or unsafe evidence files', () => {
    const changed = fixture(); changed.requirements[0]!.tickets = ['RIR-DOES-NOT-EXIST'];
    expect(validateRequirements(changed, blueprint, board, () => true).join('\n')).toContain('link existing');
    expect(validateRequirements(fixture(), blueprint, board, () => false).join('\n')).toContain('missing or unsafe evidence');
    changed.requirements[0]!.evidence[0]!.path = '../private.md';
    expect(validateRequirements(changed, blueprint, board, () => true).join('\n')).toContain('missing or unsafe evidence ../private.md');
  });
  it('rejects completion claims based only on documents or disguised test evidence', () => {
    const changed = fixture(); changed.requirements[10]!.status = 'implemented';
    expect(validateRequirements(changed, blueprint, board, () => true).join('\n')).toContain('implemented claims need implementation and test evidence');
    changed.requirements[10]!.evidence.push({ kind: 'test', path: 'docs/testing.md', note: 'Documentation is not a test' });
    expect(validateRequirements(changed, blueprint, board, () => true).join('\n')).toContain('test evidence must reference an executable test file');
    const supported = fixture(); supported.requirements[8]!.status = 'implemented';
    expect(validateRequirements(supported, blueprint, board, () => true)).toEqual([]);
  });
  it('validates runtime shape and source provenance without silent unknown fields', () => {
    expect(() => parseRequirements({ ...fixture(), silentOverride: true })).toThrow('missing or unknown');
    const changed = fixture(); changed.source.sectionCount = 90;
    expect(() => parseRequirements(changed)).toThrow('91 numbered sections');
    expect(() => parseRequirements({ ...fixture(), requirements: [{ ...fixture().requirements[0], status: 'done-ish' }] })).toThrow('invalid status');
  });
  it('keeps a completed delivery handoff visible when no execution ticket remains', () => {
    const copy = structuredClone(board);
    const active = copy.batches.find((entry) => entry.status !== 'closed') ?? copy.batches.at(-1)!;
    for (const ticket of copy.tickets) if (active.tickets.includes(ticket.id)) { ticket.status = 'done'; ticket.handoff = `.workboard/handoffs/${ticket.id}/review.md`; }
    active.status = 'checkpoint';
    const rendered = renderBoard(copy);
    expect(rendered).toContain('No occupied ticket.');
    expect(rendered).toContain('[handoff](handoffs/');
  });
});
