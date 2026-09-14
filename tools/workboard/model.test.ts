import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyCommand, parseBoard, parseCommand, validateBoard } from './model.ts';
import type { Assignment, Batch, Board, Command, Decision, Ticket } from './types.ts';

const NOW = '2026-09-14T16:00:00Z';
const context = { actor: 'coordinator', now: NOW };
const handoff = (id: string): string => `.workboard/handoffs/${id}/2026-09-14-test.md`;
const run = (board: Board, command: Command): Board => applyCommand(board, command, context);

function ticket(id: string, type: Ticket['type'], parent: string | null, scope = id): Ticket {
  return {
    id, type, parent, deliveryScope: scope, title: `Implement ${id}`, status: 'ready', requires: [],
    estimate: type === 'epic' ? 21 : 3, estimateRationale: 'Relative complexity including acceptance verification',
    groomedIn: 'G-1', priority: 'P2', acceptance: ['The declared behavior is verified'], paths: ['code/'],
    owner: null, handoff: null, validation: [],
  };
}

function batch(id = 'B-1', scope = 'S-10', ids = ['S-10', 'T-1', 'T-2']): Batch {
  return {
    id, scope, branch: `feat/${scope}-implementation`, baseBranch: 'develop/2.0.0-astra', baseSha: 'a'.repeat(40),
    status: 'open', tickets: ids, prUrl: null,
  };
}

function fixture(): Board {
  const tickets = [ticket('E-1', 'epic', null), ticket('S-10', 'story', 'E-1'),
    ticket('T-1', 'task', 'S-10', 'S-10'), ticket('T-2', 'task', 'S-10', 'S-10'), ticket('S-20', 'story', 'E-1')];
  const second = tickets.find((item) => item.id === 'T-2');
  if (second) second.requires = ['T-1'];
  return {
    version: 1, revision: 0,
    policy: { pointScale: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89], wipLimit: 1, repository: 'RirikoAI/RirikoBot', remote: 'origin', remoteUrl: 'https://github.com/RirikoAI/RirikoBot.git', baseBranch: 'develop/2.0.0-astra' },
    tickets, grooming: [{ id: 'G-1', scope: 'E-1', at: NOW, participants: ['coordinator', 'architecture'], tickets: tickets.map((item) => item.id), rationale: 'Epic refinement with relative points and dependency review' }],
    decisions: [], assignments: [], batches: [batch()], history: [],
  };
}

function get(board: Board, id = 'T-1'): Ticket {
  const found = board.tickets.find((item) => item.id === id);
  if (!found) throw new Error('Missing test ticket');
  return found;
}

function begin(board = fixture(), id = 'T-1'): Board {
  return run(board, { action: 'start', ticket: id, owner: 'coordinator' });
}

function finish(board: Board, id = 'T-1'): Board {
  let next = run(board, { action: 'move', ticket: id, status: 'review', reason: 'Implementation verified', handoff: handoff(id), validation: ['Unit regression suite passed'] });
  next = run(next, { action: 'move', ticket: id, status: 'done', reason: 'Acceptance reviewed', handoff: handoff(id), validation: ['All acceptance criteria reviewed with exact test evidence'] });
  return next;
}

function switching(id = 'D-1', fromTicket = 'T-1', toTicket: string | null = null, disposition: Decision['disposition'] = 'paused'): Decision {
  return { id, kind: 'switch', fromTicket, toTicket, disposition, batchId: null, at: NOW, reference: 'User reply in current task: pause the current ticket and preserve its handoff' };
}

function worker(id = 'A-1', paths = ['code/one.ts']): Assignment {
  return { id, ticket: 'T-1', agent: `worker-${id}`, scope: 'Implement the bounded adapter and return test evidence', paths, status: 'assigned', handoff: null };
}

describe('runtime workboard parsing', () => {
  it('records fresh stack consent for a published closed parent without changing its PR', () => {
    const input = fixture();
    const parent = input.batches[0]!;
    parent.status = 'closed'; parent.prUrl = 'https://github.com/RirikoAI/RirikoBot/pull/557';
    input.decisions.push({ id: 'D-published', kind: 'pr-created', reference: 'Verified existing parent PR', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: parent.id });
    const decision: Decision = { id: 'D-new-stack', kind: 'stack', reference: 'User approves one separate documentation epic above the open parent PR', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: parent.id };
    const consented = run(input, { action: 'decision', decision });
    const next = run(consented, { action: 'batch', batch: { ...batch('B-2', 'S-20', ['S-20']), stack: { parentBatch: parent.id, parentHead: 'b'.repeat(40), decision: decision.id } } });
    expect(next.batches[0]).toEqual(parent);
    expect(next.batches[1]?.stack?.decision).toBe(decision.id);
    expect(next.decisions.find((entry) => entry.id === 'D-published')?.kind).toBe('pr-created');
    const reused = structuredClone(next);
    reused.batches.push({ ...batch('B-3', 'S-20', ['S-20']), stack: { parentBatch: parent.id, parentHead: 'b'.repeat(40), decision: decision.id } });
    expect(validateBoard(reused).join('\n')).toContain('one stacking decision cannot authorize multiple delivery scopes');
  });
  it.each(['open', 'checkpoint'] as const)('refuses fresh stack consent while the parent is %s', (status) => {
    const input = fixture(); input.batches[0]!.status = status;
    expect(() => run(input, { action: 'decision', decision: { id: 'D-stack', kind: 'stack', reference: 'Actual new user request still needs the prior delivery resolved', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-1' } })).toThrow('closed parent delivery');
  });
  it('never treats stack consent as a publication or deferral decision', () => {
    const input = fixture(); input.batches[0]!.status = 'checkpoint';
    input.decisions.push({ id: 'D-stack', kind: 'stack', reference: 'Stack consent is not approval to close or publish', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-1' });
    input.history.push({ id: 1, at: NOW, actor: 'coordinator', action: 'decision', detail: JSON.stringify({ action: 'decision', decision: input.decisions[0] }) });
    input.revision = 1;
    expect(() => run(input, { action: 'close-batch', batch: 'B-1', decision: 'D-stack' })).toThrow('matching user PR-created or defer-pr decision');
  });
  it('records an approved stack only once against an earlier closed parent delivery', () => {
    const input = fixture();
    input.batches.unshift({ ...batch('B-0', 'S-20', ['S-20']), status: 'closed' });
    input.decisions.push({ id: 'D-stack', kind: 'defer-pr', reference: 'User explicitly defers the parent and approves one stacked story', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-0' });
    const command: Command = { action: 'stack', batch: 'B-1', parentBatch: 'B-0', parentHead: 'b'.repeat(40), decision: 'D-stack' };
    const next = run(input, command);
    expect(next.batches[1]?.stack?.parentBatch).toBe('B-0');
    expect(() => run(next, command)).toThrow('once on the open batch');
    expect(() => run(input, { ...command, decision: 'missing' })).toThrow('matching parent deferral');
    expect(() => run(input, { ...command, parentBatch: 'B-1' })).toThrow('earlier closed parent');
  });
  it('requires a relationship for standalone maintenance and a recorded user pause decision', () => {
    const isolated: Ticket = { ...ticket('C-1', 'chore', null), status: 'backlog', estimate: null, groomedIn: null };
    expect(() => run(fixture(), { action: 'create', ticket: isolated })).toThrow('relationship');
    expect(() => run(fixture(), { action: 'create', ticket: { ...isolated, requires: ['T-1'] } })).not.toThrow();
    const paused = fixture(); get(paused).status = 'paused'; get(paused).owner = 'coordinator'; get(paused).handoff = handoff('T-1');
    expect(() => parseBoard(paused)).toThrow('pause requires an explicit matching user decision');
  });
  it('accepts the repository bootstrap/projection and returns an isolated copy', () => {
    const source: unknown = JSON.parse(readFileSync(new URL('../../.workboard/state.json', import.meta.url), 'utf8'));
    expect(validateBoard(parseBoard(source))).toEqual([]);
    const original = fixture();
    const copy = parseBoard(original);
    get(copy).title = 'Changed';
    expect(get(original).title).not.toBe('Changed');
  });

  it('rejects unknown, missing and incorrectly typed nested fields', () => {
    expect(() => parseBoard({ ...fixture(), ignored: true })).toThrow('unknown field');
    expect(() => parseBoard({ ...fixture(), revision: '0' })).toThrow('expected number');
    expect(() => parseBoard({ ...fixture(), tickets: [{ ...get(fixture()), estimate: '3' }] })).toThrow('expected nullable-number');
    expect(() => parseBoard({ ...fixture(), policy: { ...fixture().policy, wipLimit: 2 } })).toThrow('expected one of 1');
    expect(() => parseBoard({ ...fixture(), tickets: [null] })).toThrow('expected object');
  });

  it('validates command shape before attempting any transition', () => {
    expect(() => parseCommand({ action: 'start', ticket: 'T-1' })).toThrow('owner: required');
    expect(() => parseCommand({ action: 'delete', ticket: 'T-1' })).toThrow('known workflow command');
    expect(() => parseCommand({ action: 'start', ticket: 'T-1', owner: 'coordinator', force: true })).toThrow('unknown field');
    expect(() => parseCommand({ action: 'move', ticket: 'T-1', status: 'banana', reason: 'bad', handoff: handoff('T-1') })).toThrow('expected one of');
    expect(() => parseCommand({ action: 'decision', decision: { ...switching(), disposition: false } })).toThrow('disposition');
    expect(parseCommand({ action: 'start', ticket: 'T-1', owner: 'coordinator' })).toEqual({ action: 'start', ticket: 'T-1', owner: 'coordinator' });
  });

  it('detects duplicate IDs, missing references and dependency/parent cycles', () => {
    const duplicate = fixture();
    duplicate.tickets.push(structuredClone(get(duplicate)));
    expect(validateBoard(duplicate).join('\n')).toContain('duplicate T-1');
    const missing = fixture();
    get(missing).requires = ['absent'];
    expect(validateBoard(missing).join('\n')).toContain('missing required ticket');
    const cycle = fixture();
    get(cycle).requires = ['T-2'];
    expect(validateBoard(cycle).join('\n')).toContain('requires cycle');
    get(cycle).parent = 'T-2';
    get(cycle, 'T-2').parent = 'T-1';
    expect(validateBoard(cycle).join('\n')).toContain('parent cycle');
  });

  it('rejects executable roots and delivery scopes outside ancestry', () => {
    const board = fixture();
    get(board).parent = null;
    expect(validateBoard(board).join('\n')).toContain('task needs a parent');
    get(board).parent = 'S-10';
    get(board).deliveryScope = 'S-20';
    expect(validateBoard(board).join('\n')).toContain('invalid delivery scope');
  });

  it('requires consecutive history and a fixed Fibonacci policy', () => {
    expect(validateBoard({ ...fixture(), revision: 1 }).join('\n')).toContain('exactly one entry per revision');
    const board = fixture();
    board.policy.pointScale.push(4);
    expect(validateBoard(board).join('\n')).toContain('fixed Fibonacci');
    expect(() => applyCommand(fixture(), { action: 'start', ticket: 'T-1', owner: 'coordinator' }, { actor: 'coordinator', now: 'yesterday' })).toThrow('ISO timestamp');
  });
});

describe('estimation and refinement before execution', () => {
  it('creates backlog work, grooms the complete group, marks ready and starts', () => {
    let board = fixture();
    const item = ticket('T-3', 'task', 'S-10', 'S-10');
    item.status = 'backlog'; item.estimate = null; item.groomedIn = null;
    board = run(board, { action: 'create', ticket: item });
    expect(() => run(board, { action: 'start', ticket: 'T-3', owner: 'coordinator' })).toThrow('ready or paused');
    board = run(board, { action: 'groom', grooming: { id: 'G-2', scope: 'S-10', at: NOW, participants: ['coordinator'], tickets: ['T-3'], rationale: 'Bounded follow-up refinement' }, estimates: [{ id: 'T-3', points: 5, rationale: 'Five points due to adapter uncertainty' }] });
    board = run(board, { action: 'move', ticket: 'T-3', status: 'ready', reason: 'Scope and acceptance reviewed', handoff: handoff('T-3') });
    expect(get(board, 'T-3').estimate).toBe(5);
    expect(() => begin(board, 'T-3')).toThrow('outside active batch');
  });

  it('rejects ungroomed, unestimated, empty-acceptance, and oversized ready work', () => {
    const unknown = fixture(); get(unknown).estimate = null;
    expect(() => begin(unknown)).toThrow('estimate required');
    const ungroomed = fixture(); get(ungroomed).groomedIn = null;
    expect(() => begin(ungroomed)).toThrow('grouped grooming required');
    const acceptance = fixture(); get(acceptance).acceptance = [];
    expect(() => begin(acceptance)).toThrow('acceptance criteria');
    const oversized = fixture(); get(oversized).estimate = 21;
    expect(() => begin(oversized)).toThrow('must be split');
    const badScale = fixture(); get(badScale).estimate = 4;
    expect(() => begin(badScale)).toThrow('estimate must be Fibonacci');
  });

  it('requires grooming estimates to cover exactly the named group and freezes started estimates', () => {
    const grooming = { id: 'G-2', scope: 'S-10', at: NOW, participants: ['coordinator'], tickets: ['T-1', 'T-2'], rationale: 'Group refinement' };
    expect(() => run(fixture(), { action: 'groom', grooming, estimates: [{ id: 'T-1', points: 3, rationale: 'Small' }] })).toThrow('every listed ticket exactly once');
    expect(() => run(begin(), { action: 'groom', grooming: { ...grooming, tickets: ['T-1'] }, estimates: [{ id: 'T-1', points: 5, rationale: 'Retrospective padding' }] })).toThrow('frozen after work starts');
    const crossScope = { ...grooming, scope: 'S-20' };
    expect(() => run(fixture(), { action: 'groom', grooming: crossScope, estimates: [{ id: 'T-1', points: 3, rationale: 'Small' }, { id: 'T-2', points: 5, rationale: 'Medium' }] })).toThrow('outside the grooming group');
  });
});

describe('one execution slot and durable transitions', () => {
  it('keeps one slot through blocked and review states, and rejects a persisted WIP race', () => {
    let board = begin();
    expect(() => begin(board, 'T-2')).toThrow('Stop and ask the user');
    board = run(board, { action: 'move', ticket: 'T-1', status: 'blocked', reason: 'Waiting for documented fixture', handoff: handoff('T-1') });
    expect(() => begin(board, 'T-2')).toThrow('is blocked');
    board = run(board, { action: 'move', ticket: 'T-1', status: 'review', reason: 'Fixture resolved', handoff: handoff('T-1'), validation: ['Fixture regression passed'] });
    expect(() => begin(board, 'T-2')).toThrow('is review');
    const race = structuredClone(board);
    get(race, 'T-2').status = 'in-progress'; get(race, 'T-2').owner = 'other-session';
    expect(() => parseBoard(race)).toThrow('WIP limit is 1');
  });

  it('requires dependencies done and keeps parents out of the execution slot', () => {
    expect(() => begin(fixture(), 'T-2')).toThrow('requires T-1 to be done');
    expect(() => begin(fixture(), 'S-10')).toThrow('parent container');
    expect(() => begin(fixture(), 'E-1')).toThrow('parent container');
    const board = finish(begin());
    expect(get(begin(board, 'T-2'), 'T-2').status).toBe('in-progress');
  });

  it('requires review and fresh evidence before completion and prevents terminal reopening', () => {
    const active = begin();
    expect(() => run(active, { action: 'move', ticket: 'T-1', status: 'done', reason: 'Skip review', handoff: handoff('T-1'), validation: ['Claimed'] })).toThrow('Invalid transition');
    expect(() => run(active, { action: 'move', ticket: 'T-1', status: 'review', reason: 'Ready', handoff: handoff('T-1') })).toThrow('fresh acceptance');
    expect(() => run(active, { action: 'move', ticket: 'T-1', status: 'blocked', reason: 'Waiting', handoff: 'chat-only' })).toThrow('durable handoff');
    const done = finish(active);
    expect(() => run(done, { action: 'move', ticket: 'T-1', status: 'ready', reason: 'Reopen', handoff: handoff('T-1') })).toThrow('terminal tickets cannot reopen');
    expect(() => run(fixture(), { action: 'move', ticket: 'S-10', status: 'done', reason: 'Premature closure', handoff: handoff('S-10'), validation: ['Claimed'] })).toThrow('child T-1');
  });

  it('makes commands atomic and appends one event per successful revision', () => {
    const original = fixture();
    const board = begin(original);
    expect(original.revision).toBe(0);
    expect(get(original).status).toBe('ready');
    expect(board.revision).toBe(1);
    expect(board.history[0]).toMatchObject({ id: 1, action: 'start', actor: 'coordinator' });
    expect(() => begin(board, 'T-2')).toThrow();
    expect(board.revision).toBe(1);
  });

  it('checkpoints session knowledge while retaining the active slot and unfinished assignments', () => {
    const initial = run(begin(), { action: 'assign', assignment: worker() });
    const command: Command = { action: 'handoff', ticket: 'T-1', handoff: handoff('T-1'), reason: 'Session recovery checkpoint with worker status', validation: ['Adapter assertions passed; worker A-1 still executing'] };
    expect(parseCommand(command)).toEqual(command);
    const saved = run(initial, command);
    expect(get(saved)).toMatchObject({ status: 'in-progress', handoff: handoff('T-1') });
    expect(saved.assignments[0]?.status).toBe('assigned');
    expect(saved.history.at(-1)?.action).toBe('handoff');
    expect(() => begin(saved, 'T-2')).toThrow('WIP limit is 1');
    expect(() => run(saved, { ...command, ticket: 'T-2', handoff: handoff('T-2') })).toThrow('current occupied ticket');
    expect(() => applyCommand(saved, command, { ...context, actor: 'worker-A-1' })).toThrow('Only the coordinator');
  });
});

describe('explicit user switching and permanent abandonment', () => {
  it('forbids direct pause/abandon and worker-authored user decisions', () => {
    const board = begin();
    for (const status of ['paused', 'abandoned'] as const) expect(() => run(board, { action: 'move', ticket: 'T-1', status, reason: 'Another task', handoff: handoff('T-1') })).toThrow('matching recorded user decision');
    expect(() => applyCommand(board, { action: 'decision', decision: switching() }, { ...context, actor: 'worker' })).toThrow('Only the coordinator');
    expect(() => run(board, { action: 'switch', from: 'T-1', to: null, decision: 'missing', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('recorded user decision');
  });

  it('pauses with a handoff, resumes, and does not reuse a consumed decision', () => {
    let board = run(begin(), { action: 'decision', decision: switching() });
    board = run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') });
    expect(get(board)).toMatchObject({ status: 'paused', handoff: handoff('T-1') });
    board = begin(board);
    expect(() => run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('already been consumed');
  });

  it('rejects an unused decision made stale by an intervening switch and resume', () => {
    let board = run(begin(), { action: 'decision', decision: switching() });
    board = run(board, { action: 'decision', decision: switching('D-2') });
    board = run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-2', owner: 'coordinator', handoff: handoff('T-1') });
    board = begin(board);
    expect(() => run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('stale after an execution switch');
  });

  it('switches atomically only to the approved ready ticket within the same delivery scope', () => {
    const initial = fixture(); get(initial, 'T-2').requires = [];
    const approved = run(begin(initial), { action: 'decision', decision: switching('D-1', 'T-1', 'T-2') });
    expect(() => run(approved, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('exactly match');
    const switched = run(approved, { action: 'switch', from: 'T-1', to: 'T-2', decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') });
    expect(get(switched).status).toBe('paused');
    expect(get(switched, 'T-2').status).toBe('in-progress');
    expect(switched.history.at(-1)?.action).toBe('switch');
    const crossScope = run(begin(), { action: 'decision', decision: switching('D-1', 'T-1', 'S-20') });
    expect(() => run(crossScope, { action: 'switch', from: 'T-1', to: 'S-20', decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('outside active batch');
    expect(get(crossScope).status).toBe('in-progress');
  });

  it('never reopens abandonment or treats it as dependency completion', () => {
    let board = run(begin(), { action: 'decision', decision: switching('D-1', 'T-1', null, 'abandoned') });
    board = run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') });
    expect(() => begin(board)).toThrow('permanently abandoned');
    expect(() => begin(board, 'T-2')).toThrow('requires T-1 to be done');
    const forged = structuredClone(board); forged.decisions = [];
    expect(() => parseBoard(forged)).toThrow('explicit matching user decision');
  });

  it('can close a parent with done and explicitly abandoned children', () => {
    const initial = fixture(); get(initial, 'T-2').requires = [];
    let board = finish(begin(initial));
    board = begin(board, 'T-2');
    board = run(board, { action: 'decision', decision: switching('D-1', 'T-2', null, 'abandoned') });
    board = run(board, { action: 'switch', from: 'T-2', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-2') });
    board = run(board, { action: 'move', ticket: 'S-10', status: 'done', reason: 'Accepted reduced scope with explicit child abandonment', handoff: handoff('S-10'), validation: ['T-1 acceptance verified; T-2 cancellation recorded in D-1'] });
    expect(get(board, 'S-10').status).toBe('done');
  });
});

describe('worker handoff protocol', () => {
  it('accepts only bounded nonoverlapping assignments and settles returns before status transitions', () => {
    let board = run(begin(), { action: 'assign', assignment: worker() });
    board = run(board, { action: 'assign', assignment: worker('A-2', ['code/two.ts']) });
    expect(() => run(board, { action: 'assign', assignment: worker('A-3', ['code/']) })).toThrow('write paths overlap');
    expect(() => run(board, { action: 'assign', assignment: worker('A-3', ['CODE/ONE.ts']) })).toThrow('write paths overlap');
    expect(() => run(board, { action: 'assign', assignment: worker('A-3', ['other/file.ts']) })).toThrow('outside ticket ownership');
    expect(() => run(board, { action: 'move', ticket: 'T-1', status: 'review', reason: 'Done', handoff: handoff('T-1'), validation: ['Tests passed'] })).toThrow('unsettled assignments');
    expect(() => run(board, { action: 'accept', assignment: 'A-1' })).toThrow('Persist a worker return');
    expect(() => applyCommand(board, { action: 'return', assignment: 'A-1', handoff: handoff('T-1') }, { ...context, actor: 'other-worker' })).toThrow('Only the assigned worker');
    board = applyCommand(board, { action: 'return', assignment: 'A-1', handoff: handoff('T-1') }, { ...context, actor: 'worker-A-1' });
    expect(() => applyCommand(board, { action: 'accept', assignment: 'A-1' }, { ...context, actor: 'worker-A-1' })).toThrow('Only the coordinator');
    board = run(board, { action: 'accept', assignment: 'A-1' });
    board = run(board, { action: 'return', assignment: 'A-2', handoff: handoff('T-1') });
    board = run(board, { action: 'accept', assignment: 'A-2' });
    expect(get(finish(board)).status).toBe('done');
  });

  it('does not switch while a return awaits coordinator acceptance', () => {
    let board = run(begin(), { action: 'assign', assignment: worker() });
    board = run(board, { action: 'return', assignment: 'A-1', handoff: handoff('T-1') });
    board = run(board, { action: 'decision', decision: switching() });
    expect(() => run(board, { action: 'switch', from: 'T-1', to: null, decision: 'D-1', owner: 'coordinator', handoff: handoff('T-1') })).toThrow('unsettled assignments');
    expect(() => run(board, { action: 'assign', assignment: { ...worker('A-2'), ticket: 'T-2' } })).toThrow('current in-progress ticket');
  });

  it('rejects traversal, immutable legacy and platform-ambiguous owned paths', () => {
    for (const path of ['../outside', '.audit/RirikoBot/', '.local/RirikoBot/', '.git/config', 'C:/absolute', 'code/../secret', 'code/file.']) {
      const board = fixture(); get(board).paths = [path];
      expect(() => parseBoard(board)).toThrow('invalid/immutable owned path');
    }
  });
});

describe('single-scope delivery checkpoints', () => {
  it('requires a user PR/defer decision before another scope and then permits a leaf story', () => {
    let board = finish(begin());
    board = finish(begin(board, 'T-2'), 'T-2');
    board = run(board, { action: 'move', ticket: 'S-10', status: 'done', reason: 'Story acceptance reviewed', handoff: handoff('S-10'), validation: ['Both leaf tickets satisfy acceptance'] });
    expect(() => run(board, { action: 'batch', batch: batch('B-2', 'S-20', ['S-20']) })).toThrow('user PR/defer checkpoint');
    board = run(board, { action: 'checkpoint', batch: 'B-1' });
    expect(() => begin(board, 'S-20')).toThrow('user PR decision');
    expect(() => run(board, { action: 'close-batch', batch: 'B-1', decision: 'absent' })).toThrow('recorded user decision');
    const decision: Decision = { id: 'D-1', kind: 'defer-pr', reference: 'User explicitly deferred the concrete S-10 PR after reviewing local checkpoint', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-1' };
    board = run(board, { action: 'decision', decision });
    board = run(board, { action: 'close-batch', batch: 'B-1', decision: 'D-1' });
    board = run(board, { action: 'batch', batch: batch('B-2', 'S-20', ['S-20']) });
    board = begin(board, 'S-20');
    expect(get(board, 'S-20').status).toBe('in-progress');
    expect(board.batches[0]?.status).toBe('closed');
  });

  it('rejects premature checkpoints and recording delivery decisions before the checkpoint', () => {
    expect(() => run(begin(), { action: 'checkpoint', batch: 'B-1' })).toThrow('settle assignments');
    const decision: Decision = { id: 'D-1', kind: 'defer-pr', reference: 'Claimed reply', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-1' };
    expect(() => run(fixture(), { action: 'decision', decision })).toThrow('current delivery checkpoint');
  });

  it('rejects wrong base, wrong topic scope, cross-story membership, and reused branches', () => {
    for (const change of [
      { baseBranch: 'develop/2.0.0' }, { branch: 'develop/2.0.0-astra' },
      { branch: 'feat/S-20-wrong' }, { tickets: ['T-1', 'S-20'] },
    ]) {
      const board = fixture(); board.batches = [{ ...batch(), ...change }];
      expect(() => parseBoard(board)).toThrow();
    }
    const board = fixture(); board.batches.push(batch('B-2'));
    expect(validateBoard(board).join('\n')).toContain('Only one open/checkpoint delivery batch');
    expect(validateBoard(board).join('\n')).toContain('Batch branches');
  });

  it('records a verified repository PR only with its matching delivery decision', () => {
    let board = run(fixture(), { action: 'checkpoint', batch: 'B-1' });
    const decision: Decision = { id: 'D-1', kind: 'pr-created', reference: 'User authorized current head/base; verified created PR', at: NOW, fromTicket: null, toTicket: null, disposition: null, batchId: 'B-1' };
    board = run(board, { action: 'decision', decision });
    expect(() => run(board, { action: 'close-batch', batch: 'B-1', decision: 'D-1' })).toThrow('verified repository PR URL');
    expect(() => run(board, { action: 'close-batch', batch: 'B-1', decision: 'D-1', prUrl: 'https://github.com/other/repo/pull/1' })).toThrow('verified repository PR URL');
    board = run(board, { action: 'close-batch', batch: 'B-1', decision: 'D-1', prUrl: 'https://github.com/RirikoAI/RirikoBot/pull/123' });
    expect(board.batches[0]).toMatchObject({ status: 'closed', prUrl: 'https://github.com/RirikoAI/RirikoBot/pull/123' });
  });
});
