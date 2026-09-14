import type { Assignment, Batch, Board, Command, Decision, MutationContext, Status, Ticket } from './types.ts';

const POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;
const STATUSES = ['backlog', 'ready', 'in-progress', 'blocked', 'paused', 'review', 'done', 'abandoned'] as const;
const ACTIVE: ReadonlySet<Status> = new Set(['in-progress', 'blocked', 'review']);
const TERMINAL: ReadonlySet<Status> = new Set(['done', 'abandoned']);
const MAINTENANCE = new Set(['chore', 'bug', 'spike']);

type Shape = 'string' | 'number' | 'nullable-string' | 'nullable-number'
  | { kind: 'enum'; values: readonly (string | number | null)[] }
  | { kind: 'array'; item: Shape }
  | { kind: 'object'; fields: Readonly<Record<string, Shape>>; optional: readonly string[] };
const enumeration = (...values: readonly (string | number | null)[]): Shape => ({ kind: 'enum', values });
const array = (item: Shape): Shape => ({ kind: 'array', item });
const object = (fields: Readonly<Record<string, Shape>>, optional: readonly string[] = []): Shape => ({ kind: 'object', fields, optional });
const strings = array('string');
const ticketShape = object({
  id: 'string', type: enumeration('epic', 'story', 'task', 'chore', 'bug', 'spike'), title: 'string',
  status: enumeration(...STATUSES), parent: 'nullable-string', requires: strings, deliveryScope: 'string',
  estimate: 'nullable-number', estimateRationale: 'string', groomedIn: 'nullable-string',
  priority: enumeration('P0', 'P1', 'P2', 'P3'), acceptance: strings, paths: strings,
  owner: 'nullable-string', handoff: 'nullable-string', validation: strings,
});
const groomingShape = object({ id: 'string', scope: 'string', at: 'string', participants: strings, tickets: strings, rationale: 'string' });
const decisionShape = object({
  id: 'string', kind: enumeration('switch', 'defer-pr', 'pr-created'), reference: 'string', at: 'string',
  fromTicket: 'nullable-string', toTicket: 'nullable-string', disposition: enumeration('paused', 'abandoned', null), batchId: 'nullable-string',
});
const assignmentShape = object({
  id: 'string', ticket: 'string', agent: 'string', scope: 'string', paths: strings,
  status: enumeration('assigned', 'returned', 'accepted'), handoff: 'nullable-string',
});
const batchShape = object({
  id: 'string', scope: 'string', branch: 'string', baseBranch: 'string', baseSha: 'string',
  status: enumeration('open', 'checkpoint', 'closed'), tickets: strings, prUrl: 'nullable-string',
});
const boardShape = object({
  version: enumeration(1), revision: 'number',
  policy: object({ pointScale: array('number'), wipLimit: enumeration(1), repository: 'string', remote: 'string', remoteUrl: 'string', baseBranch: 'string' }),
  tickets: array(ticketShape), grooming: array(groomingShape), decisions: array(decisionShape),
  assignments: array(assignmentShape), batches: array(batchShape),
  history: array(object({ id: 'number', at: 'string', actor: 'string', action: 'string', detail: 'string' })),
});
const commandShapes: Readonly<Record<Command['action'], Shape>> = {
  create: object({ action: enumeration('create'), ticket: ticketShape }),
  groom: object({ action: enumeration('groom'), grooming: groomingShape, estimates: array(object({ id: 'string', points: 'number', rationale: 'string' })) }),
  start: object({ action: enumeration('start'), ticket: 'string', owner: 'string' }),
  move: object({ action: enumeration('move'), ticket: 'string', status: enumeration(...STATUSES), reason: 'string', handoff: 'string', validation: strings }, ['validation']),
  handoff: object({ action: enumeration('handoff'), ticket: 'string', reason: 'string', handoff: 'string', validation: strings }, ['validation']),
  switch: object({ action: enumeration('switch'), from: 'string', to: 'nullable-string', decision: 'string', owner: 'string', handoff: 'string' }),
  decision: object({ action: enumeration('decision'), decision: decisionShape }),
  batch: object({ action: enumeration('batch'), batch: batchShape }),
  checkpoint: object({ action: enumeration('checkpoint'), batch: 'string' }),
  'close-batch': object({ action: enumeration('close-batch'), batch: 'string', decision: 'string', prUrl: 'string' }, ['prUrl']),
  assign: object({ action: enumeration('assign'), assignment: assignmentShape }),
  return: object({ action: enumeration('return'), assignment: 'string', handoff: 'string' }),
  accept: object({ action: enumeration('accept'), assignment: 'string' }),
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inspectShape(value: unknown, shape: Shape, path: string, errors: string[]): void {
  if (typeof shape === 'string') {
    if (shape.startsWith('nullable-') && value === null) return;
    if (shape.endsWith('string') && typeof value === 'string' && value.trim().length > 0) return;
    if (shape.endsWith('number') && typeof value === 'number' && Number.isFinite(value)) return;
    errors.push(`${path}: expected ${shape}`);
    return;
  }
  if (shape.kind === 'enum') {
    if ((value === null || typeof value === 'string' || typeof value === 'number') && shape.values.includes(value)) return;
    errors.push(`${path}: expected one of ${shape.values.join(', ')}`);
  } else if (shape.kind === 'array') {
    if (!Array.isArray(value)) errors.push(`${path}: expected array`);
    else value.forEach((item: unknown, index) => inspectShape(item, shape.item, `${path}[${index}]`, errors));
  } else if (!record(value)) {
    errors.push(`${path}: expected object`);
  } else {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(shape.fields, key)) errors.push(`${path}.${key}: unknown field`);
    }
    for (const [key, fieldShape] of Object.entries(shape.fields)) {
      if (!Object.hasOwn(value, key)) {
        if (!shape.optional.includes(key)) errors.push(`${path}.${key}: required field`);
      } else inspectShape(value[key], fieldShape, `${path}.${key}`, errors);
    }
  }
}

function requireValid(errors: string[]): void {
  if (errors.length) throw new Error(`Workboard rejected:\n- ${errors.join('\n- ')}`);
}

/** Validate all runtime input before treating JSON as a board. Does not mutate input. */
export function parseBoard(value: unknown): Board {
  const errors: string[] = [];
  inspectShape(value, boardShape, 'board', errors);
  requireValid(errors);
  const board = value as Board;
  requireValid(validateBoard(board));
  return structuredClone(board);
}

/** Exact command parsing is shared by the CLI and the pure transition engine. */
export function parseCommand(value: unknown): Command {
  if (!record(value) || typeof value.action !== 'string' || !Object.hasOwn(commandShapes, value.action)) {
    throw new Error('Workboard rejected: command.action must be a known workflow command');
  }
  const errors: string[] = [];
  inspectShape(value, commandShapes[value.action as Command['action']], 'command', errors);
  requireValid(errors);
  return structuredClone(value) as Command;
}

function dateValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function pathValid(path: string): boolean {
  if (!path || [...path].some((character) => '\\:*?[]'.includes(character)) || hasControlCharacters(path) || path.startsWith('/')) return false;
  const parts = path.replace(/\/$/, '').split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..' && !/[. ]$/.test(part))
    && !parts.some((part) => ['.git', '.audit', '.local'].includes(part.toLowerCase()));
}

function ownsPath(parent: string, path: string): boolean {
  const normalizedParent = parent.toLowerCase();
  const normalizedPath = path.toLowerCase();
  return normalizedParent === normalizedPath || (normalizedParent.endsWith('/') && normalizedPath.startsWith(normalizedParent));
}

function handoffValid(path: string | null, ticket: string): boolean {
  return path !== null && pathValid(path) && path.startsWith(`.workboard/handoffs/${ticket}/`) && !path.endsWith('/');
}

function branchValid(branch: string): boolean {
  return !branch.startsWith('/') && !branch.endsWith('/') && !branch.endsWith('.') && !branch.endsWith('.lock')
    && !branch.includes('..') && !branch.includes('//') && !branch.includes('@{')
    && !/\s/.test(branch) && !hasControlCharacters(branch) && ![...branch].some((character) => '~^:?*[]\\'.includes(character))
    && branch.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}

function ticketById(board: Board, id: string): Ticket {
  const ticket = board.tickets.find((item) => item.id === id);
  if (!ticket) throw new Error(`Unknown ticket ${id}`);
  return ticket;
}

function batchById(board: Board, id: string): Batch {
  const batch = board.batches.find((item) => item.id === id);
  if (!batch) throw new Error(`Unknown delivery batch ${id}`);
  return batch;
}

function assignmentById(board: Board, id: string): Assignment {
  const assignment = board.assignments.find((item) => item.id === id);
  if (!assignment) throw new Error(`Unknown assignment ${id}`);
  return assignment;
}

function descendsFrom(tickets: Map<string, Ticket>, id: string, ancestor: string): boolean {
  const seen = new Set<string>();
  let current: string | null = id;
  while (current !== null && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = tickets.get(current)?.parent ?? null;
  }
  return false;
}

function container(board: Board, ticket: Ticket): boolean {
  return ticket.type === 'epic' || board.tickets.some((child) => child.parent === ticket.id);
}

function explicitAbandonment(board: Board, ticket: Ticket): boolean {
  return ticket.status === 'abandoned' && board.decisions.some((decision) => decision.kind === 'switch'
    && decision.fromTicket === ticket.id && decision.disposition === 'abandoned');
}

function duplicates(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}: duplicate ${value}`);
    seen.add(value);
  }
}

function cycles(tickets: Map<string, Ticket>, relation: 'parent' | 'requires', errors: string[]): void {
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { errors.push(`${relation} cycle includes ${id}`); return; }
    if (done.has(id)) return;
    const ticket = tickets.get(id);
    if (!ticket) return;
    visiting.add(id);
    for (const next of relation === 'requires' ? ticket.requires : ticket.parent === null ? [] : [ticket.parent]) visit(next);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of tickets.keys()) visit(id);
}

/** Structural and cross-record invariants, including persisted states loaded in a later session. */
export function validateBoard(board: Board): string[] {
  const errors: string[] = [];
  inspectShape(board, boardShape, 'board', errors);
  if (errors.length) return errors;
  if (!Number.isSafeInteger(board.revision) || board.revision < 0) errors.push('revision must be a nonnegative safe integer');
  if (JSON.stringify(board.policy.pointScale) !== JSON.stringify(POINTS)) errors.push('policy.pointScale must use the fixed Fibonacci scale');
  if (!/^[\w.-]+\/[\w.-]+$/.test(board.policy.repository)) errors.push('policy.repository must be owner/repository');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(board.policy.remote)) errors.push('policy.remote is invalid');
  if (!branchValid(board.policy.baseBranch)) errors.push('policy.baseBranch is invalid');
  if (!/^(?:https:\/\/[^\s]+|git@[^\s:]+:[^\s]+)$/.test(board.policy.remoteUrl)) errors.push('policy.remoteUrl must identify an HTTPS or SSH remote');
  const records = [...board.tickets, ...board.grooming, ...board.decisions, ...board.assignments, ...board.batches];
  duplicates(records.map((item) => item.id), 'record IDs', errors);
  for (const item of records) if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.id)) errors.push(`Invalid record ID ${item.id}`);
  const tickets = new Map(board.tickets.map((ticket) => [ticket.id, ticket]));
  const groups = new Map(board.grooming.map((group) => [group.id, group]));
  const batches = new Map(board.batches.map((batch) => [batch.id, batch]));
  const active = board.tickets.filter((ticket) => ACTIVE.has(ticket.status));
  if (active.length > 1) errors.push(`WIP limit is 1; active tickets: ${active.map((ticket) => ticket.id).join(', ')}`);
  const liveBatches = board.batches.filter((batch) => batch.status !== 'closed');
  if (liveBatches.length > 1) errors.push('Only one open/checkpoint delivery batch is permitted');

  for (const ticket of board.tickets) {
    const label = `Ticket ${ticket.id}`;
    if (ticket.parent === ticket.id) errors.push(`${label}: cannot parent itself`);
    if (ticket.parent !== null && !tickets.has(ticket.parent)) errors.push(`${label}: missing parent ${ticket.parent}`);
    if (ticket.parent === null && ticket.type !== 'epic' && !MAINTENANCE.has(ticket.type)) errors.push(`${label}: ${ticket.type} needs a parent`);
    if (ticket.parent === null && MAINTENANCE.has(ticket.type) && !ticket.requires.length && !board.tickets.some((entry) => entry.parent === ticket.id || entry.requires.includes(ticket.id))) errors.push(`${label}: standalone work needs a parent/child or dependency relationship`);
    if (ticket.type === 'epic' && ticket.parent !== null) errors.push(`${label}: epics must be roots`);
    duplicates(ticket.requires, `${label} requires`, errors);
    for (const dependency of ticket.requires) {
      if (!tickets.has(dependency)) errors.push(`${label}: missing required ticket ${dependency}`);
      if (dependency === ticket.id) errors.push(`${label}: cannot require itself`);
    }
    const scope = tickets.get(ticket.deliveryScope);
    if (!scope || !((['epic', 'story'].includes(scope.type) && descendsFrom(tickets, ticket.id, scope.id))
      || (scope.id === ticket.id && MAINTENANCE.has(ticket.type)))) errors.push(`${label}: invalid delivery scope ${ticket.deliveryScope}`);
    if (ticket.estimate !== null && !board.policy.pointScale.includes(ticket.estimate)) errors.push(`${label}: estimate must be Fibonacci`);
    if (ticket.groomedIn !== null) {
      const group = groups.get(ticket.groomedIn);
      if (!group || !group.tickets.includes(ticket.id)) errors.push(`${label}: grooming reference does not include ticket`);
    }
    if (ticket.status !== 'backlog') {
      if (ticket.estimate === null) errors.push(`${label}: estimate required before readiness/start`);
      if (ticket.groomedIn === null) errors.push(`${label}: grouped grooming required before readiness/start`);
      if (!ticket.acceptance.length) errors.push(`${label}: acceptance criteria required before readiness/start`);
      if (!container(board, ticket) && ticket.estimate !== null && ticket.estimate > 13) errors.push(`${label}: executable work over 13 points must be split`);
    }
    duplicates(ticket.paths, `${label} paths`, errors);
    for (const path of ticket.paths) if (!pathValid(path)) errors.push(`${label}: invalid/immutable owned path ${path}`);
    if (ticket.handoff !== null && !handoffValid(ticket.handoff, ticket.id)) errors.push(`${label}: handoff must be inside .workboard/handoffs/${ticket.id}/`);
    if (['blocked', 'paused', 'review', 'done', 'abandoned'].includes(ticket.status) && ticket.handoff === null) errors.push(`${label}: ${ticket.status} requires a durable handoff`);
    if (['review', 'done'].includes(ticket.status) && !ticket.validation.length) errors.push(`${label}: ${ticket.status} requires acceptance evidence`);
    if (['in-progress', 'blocked', 'review', 'paused'].includes(ticket.status) && ticket.owner === null) errors.push(`${label}: started work requires an owner`);
    if (ticket.status === 'abandoned' && !explicitAbandonment(board, ticket)) errors.push(`${label}: abandonment requires an explicit matching user decision`);
    if (ticket.status === 'paused' && !board.decisions.some((decision) => decision.kind === 'switch' && decision.fromTicket === ticket.id && decision.disposition === 'paused')) errors.push(`${label}: pause requires an explicit matching user decision`);
    if (ACTIVE.has(ticket.status)) {
      if (container(board, ticket)) errors.push(`${label}: parents are containers, not active work`);
      for (const required of ticket.requires) if (tickets.get(required)?.status !== 'done') errors.push(`${label}: requirement ${required} is not done`);
      if (!liveBatches.some((batch) => batch.status === 'open' && batch.tickets.includes(ticket.id) && batch.scope === ticket.deliveryScope)) errors.push(`${label}: active ticket must belong to the open delivery batch`);
    }
    if (ticket.status === 'done') {
      for (const child of board.tickets.filter((item) => item.parent === ticket.id)) {
        if (child.status !== 'done' && !explicitAbandonment(board, child)) errors.push(`${label}: child ${child.id} is unfinished or lacks explicit abandonment`);
      }
    }
  }
  cycles(tickets, 'parent', errors);
  cycles(tickets, 'requires', errors);
  for (const group of board.grooming) {
    if (!dateValid(group.at)) errors.push(`Grooming ${group.id}: invalid timestamp`);
    if (!tickets.has(group.scope)) errors.push(`Grooming ${group.id}: missing scope`);
    if (!group.tickets.length || !group.participants.length) errors.push(`Grooming ${group.id}: tickets and participants are required`);
    duplicates(group.tickets, `Grooming ${group.id} tickets`, errors);
    duplicates(group.participants, `Grooming ${group.id} participants`, errors);
    for (const id of group.tickets) {
      if (!tickets.has(id) || !descendsFrom(tickets, id, group.scope)) errors.push(`Grooming ${group.id}: ${id} is outside the grooming group`);
    }
  }
  for (const decision of board.decisions) {
    if (!dateValid(decision.at)) errors.push(`Decision ${decision.id}: invalid timestamp`);
    if (decision.kind === 'switch') {
      if (decision.fromTicket === null || !tickets.has(decision.fromTicket)) errors.push(`Decision ${decision.id}: switch requires an existing fromTicket`);
      if (decision.toTicket !== null && (!tickets.has(decision.toTicket) || decision.toTicket === decision.fromTicket)) errors.push(`Decision ${decision.id}: invalid switch destination`);
      if (decision.disposition === null || decision.batchId !== null) errors.push(`Decision ${decision.id}: switch needs a disposition and null batchId`);
    } else {
      if (decision.batchId === null || !batches.has(decision.batchId)) errors.push(`Decision ${decision.id}: delivery decision needs an existing batch`);
      if (decision.fromTicket !== null || decision.toTicket !== null || decision.disposition !== null) errors.push(`Decision ${decision.id}: delivery decision cannot contain switch fields`);
    }
  }
  for (const batch of board.batches) {
    const scope = tickets.get(batch.scope);
    if (!scope || (!['epic', 'story'].includes(scope.type) && !MAINTENANCE.has(scope.type))) errors.push(`Batch ${batch.id}: invalid scope`);
    if (scope) {
      const prefix = scope.type === 'bug' ? 'fix' : MAINTENANCE.has(scope.type) ? 'chore' : 'feat';
      if (!branchValid(batch.branch) || !(batch.branch === `${prefix}/${scope.id}` || batch.branch.startsWith(`${prefix}/${scope.id}-`))) errors.push(`Batch ${batch.id}: branch must be ${prefix}/${scope.id}-description`);
    }
    if (batch.branch === batch.baseBranch || /^(?:main|master|develop|release)(?:\/|$)/i.test(batch.branch)) errors.push(`Batch ${batch.id}: protected/base branch cannot be a topic branch`);
    if (batch.baseBranch !== board.policy.baseBranch) errors.push(`Batch ${batch.id}: base differs from the verified policy base`);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(batch.baseSha)) errors.push(`Batch ${batch.id}: baseSha must be an exact Git object ID`);
    if (!batch.tickets.length) errors.push(`Batch ${batch.id}: declared tickets are required`);
    duplicates(batch.tickets, `Batch ${batch.id} tickets`, errors);
    for (const id of batch.tickets) {
      if (tickets.get(id)?.deliveryScope !== batch.scope) errors.push(`Batch ${batch.id}: ${id} is outside the declared delivery scope`);
    }
    if (batch.prUrl !== null && !prUrlValid(batch.prUrl, board.policy.repository)) errors.push(`Batch ${batch.id}: PR URL must identify the configured repository`);
    if (batch.status !== 'closed' && batch.prUrl !== null) errors.push(`Batch ${batch.id}: only a closed batch records a PR`);
    if (batch.status === 'closed' && !board.decisions.some((decision) => decision.batchId === batch.id
      && decision.kind === (batch.prUrl === null ? 'defer-pr' : 'pr-created'))) errors.push(`Batch ${batch.id}: closure requires its matching user delivery decision`);
  }
  duplicates(board.batches.map((batch) => batch.branch), 'Batch branches (never mix delivery scopes)', errors);
  for (const assignment of board.assignments) {
    const ticket = tickets.get(assignment.ticket);
    if (!ticket) errors.push(`Assignment ${assignment.id}: missing ticket`);
    if (assignment.agent === 'coordinator') errors.push(`Assignment ${assignment.id}: use a distinct worker identity`);
    if (assignment.status !== 'accepted' && !active.some((item) => item.id === assignment.ticket)) errors.push(`Assignment ${assignment.id}: unsettled assignment must belong to the active ticket`);
    if (assignment.status !== 'assigned' && !handoffValid(assignment.handoff, assignment.ticket)) errors.push(`Assignment ${assignment.id}: return/accept requires a durable ticket handoff`);
    if (assignment.status === 'assigned' && assignment.handoff !== null) errors.push(`Assignment ${assignment.id}: assigned worker cannot already have returned a handoff`);
    duplicates(assignment.paths, `Assignment ${assignment.id} paths`, errors);
    for (const path of assignment.paths) {
      if (!pathValid(path) || !ticket?.paths.some((owned) => ownsPath(owned, path))) errors.push(`Assignment ${assignment.id}: path ${path} is outside ticket ownership`);
    }
  }
  const unsettled = board.assignments.filter((assignment) => assignment.status !== 'accepted');
  for (let left = 0; left < unsettled.length; left += 1) {
    for (let right = left + 1; right < unsettled.length; right += 1) {
      const a = unsettled[left];
      const b = unsettled[right];
      if (a && b && a.paths.some((p) => b.paths.some((q) => ownsPath(p, q) || ownsPath(q, p)))) errors.push(`Assignments ${a.id} and ${b.id}: write paths overlap`);
    }
  }
  if (board.history.length !== board.revision) errors.push('History must contain exactly one entry per revision');
  board.history.forEach((event, index) => {
    if (event.id !== index + 1) errors.push('History IDs must be consecutive and start at 1');
    if (!dateValid(event.at)) errors.push(`History ${event.id}: invalid timestamp`);
    const previous = board.history[index - 1];
    if (previous && Date.parse(event.at) < Date.parse(previous.at)) errors.push(`History ${event.id}: timestamps must not go backwards`);
  });
  return errors;
}

function prUrlValid(url: string, repository: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' && !parsed.username && !parsed.password
      && !parsed.search && !parsed.hash && parsed.pathname.startsWith(`/${repository}/pull/`)
      && /^[1-9]\d*$/.test(parsed.pathname.slice(`/${repository}/pull/`.length));
  } catch { return false; }
}

function checkSettled(board: Board, ticket: string): void {
  const pending = board.assignments.filter((assignment) => assignment.ticket === ticket && assignment.status !== 'accepted');
  if (pending.length) throw new Error(`Ticket ${ticket} has unsettled assignments: ${pending.map((assignment) => assignment.id).join(', ')}; persist returns and accept them first`);
}

function requireHandoff(path: string, ticket: string): void {
  if (!handoffValid(path, ticket)) throw new Error(`A durable handoff inside .workboard/handoffs/${ticket}/ is required`);
}

function decisionById(board: Board, id: string): Decision {
  const decision = board.decisions.find((item) => item.id === id);
  if (!decision) throw new Error(`A recorded user decision is required; unknown decision ${id}`);
  const used = board.history.some((event) => {
    if (event.action !== 'switch' && event.action !== 'close-batch') return false;
    try {
      const detail: unknown = JSON.parse(event.detail);
      return record(detail) && detail.decision === id;
    } catch { return false; }
  });
  if (used) throw new Error(`Decision ${id} has already been consumed; ask the user for a fresh decision`);
  const recordedAt = board.history.findIndex((event) => {
    if (event.action !== 'decision') return false;
    try {
      const detail: unknown = JSON.parse(event.detail);
      return record(detail) && record(detail.decision) && detail.decision.id === id;
    } catch { return false; }
  });
  if (recordedAt < 0) throw new Error(`Decision ${id} lacks its coordinator history record`);
  if (decision.kind === 'switch' && board.history.slice(recordedAt + 1).some((event) => event.action === 'switch')) {
    throw new Error(`Decision ${id} is stale after an execution switch; ask the user for a fresh decision`);
  }
  return decision;
}

function startTicket(board: Board, id: string, owner: string, now: string): void {
  const ticket = ticketById(board, id);
  const active = board.tickets.find((item) => ACTIVE.has(item.status));
  if (active) throw new Error(`WIP limit is 1: ${active.id} is ${active.status}. Stop and ask the user to pause or abandon it before switching`);
  if (ticket.status === 'abandoned') throw new Error(`Ticket ${id} is permanently abandoned and can never reopen`);
  if (!['ready', 'paused'].includes(ticket.status)) throw new Error(`Ticket ${id} must be ready or paused before starting`);
  if (container(board, ticket)) throw new Error(`Ticket ${id} is a parent container; execute its leaf tickets`);
  if (ticket.estimate === null || ticket.estimate > 13 || ticket.groomedIn === null || !ticket.acceptance.length) throw new Error(`Ticket ${id} needs grouped grooming, Fibonacci estimate <=13, and acceptance before starting`);
  const grooming = board.grooming.find((group) => group.id === ticket.groomedIn);
  if (!grooming || Date.parse(grooming.at) > Date.parse(now)) throw new Error(`Ticket ${id}: grouped grooming must occur before execution starts`);
  for (const required of ticket.requires) if (ticketById(board, required).status !== 'done') throw new Error(`Ticket ${id} requires ${required} to be done`);
  const batch = board.batches.find((item) => item.status !== 'closed');
  if (!batch || batch.status !== 'open') throw new Error('Start requires an open delivery batch; a checkpoint requires the user PR decision before further work');
  if (batch.scope !== ticket.deliveryScope || !batch.tickets.includes(id)) throw new Error(`Ticket ${id} is outside active batch ${batch.id}; stop at the scope boundary and ask about a PR`);
  ticket.status = 'in-progress';
  ticket.owner = owner;
}

/** Pure atomic transition. Callers must serialize writes and verify the real user/Git boundary. */
export function applyCommand(input: Board, inputCommand: Command, context: MutationContext): Board {
  const board = parseBoard(input);
  const command = parseCommand(inputCommand);
  const errors: string[] = [];
  inspectShape(context, object({ actor: 'string', now: 'string' }), 'context', errors);
  requireValid(errors);
  if (!dateValid(context.now)) throw new Error('Mutation context requires an ISO timestamp');
  const previous = board.history.at(-1);
  if (previous && Date.parse(context.now) < Date.parse(previous.at)) throw new Error('Mutation timestamp cannot predate the latest board event');
  if (context.actor !== 'coordinator' && command.action !== 'return') throw new Error('Only the coordinator can mutate work control or record actual user decisions');

  switch (command.action) {
    case 'create': {
      if (command.ticket.status !== 'backlog' || command.ticket.owner !== null || command.ticket.handoff !== null || command.ticket.validation.length) throw new Error('New tickets must start in backlog with no claimed work/evidence');
      if (command.ticket.parent !== null && TERMINAL.has(ticketById(board, command.ticket.parent).status)) throw new Error('Cannot add work to a completed or abandoned parent; create a new scope');
      board.tickets.push(command.ticket);
      break;
    }
    case 'groom': {
      if (Date.parse(command.grooming.at) > Date.parse(context.now)) throw new Error('Grooming timestamp cannot be in the future');
      const ids = command.estimates.map((estimate) => estimate.id);
      if (new Set(ids).size !== ids.length || ids.length !== command.grooming.tickets.length || !command.grooming.tickets.every((id) => ids.includes(id))) throw new Error('Grouped grooming must estimate every listed ticket exactly once');
      for (const estimate of command.estimates) {
        const ticket = ticketById(board, estimate.id);
        if (!['backlog', 'ready'].includes(ticket.status)) throw new Error(`Ticket ${ticket.id}: estimates are frozen after work starts; use a separately groomed follow-up ticket`);
        if (!board.policy.pointScale.includes(estimate.points)) throw new Error(`Ticket ${ticket.id}: estimate must be Fibonacci`);
        ticket.estimate = estimate.points;
        ticket.estimateRationale = estimate.rationale;
        ticket.groomedIn = command.grooming.id;
      }
      board.grooming.push(command.grooming);
      break;
    }
    case 'start': startTicket(board, command.ticket, command.owner, context.now); break;
    case 'move': {
      const ticket = ticketById(board, command.ticket);
      if (TERMINAL.has(ticket.status)) throw new Error(`Ticket ${ticket.id} is ${ticket.status}; terminal tickets cannot reopen`);
      if (command.status === 'paused' || command.status === 'abandoned') throw new Error('Pause/abandon requires an atomic switch with a matching recorded user decision');
      checkSettled(board, ticket.id);
      requireHandoff(command.handoff, ticket.id);
      const transitions: Readonly<Record<Status, readonly Status[]>> = {
        backlog: ['ready'], ready: ['backlog', 'done'], 'in-progress': ['blocked', 'review'],
        blocked: ['in-progress', 'review'], paused: [], review: ['in-progress', 'blocked', 'done'], done: [], abandoned: [],
      };
      if (!transitions[ticket.status].includes(command.status)) throw new Error(`Invalid transition ${ticket.status} -> ${command.status}; use start/switch for execution changes`);
      if (command.status === 'done' && ticket.status === 'ready' && !container(board, ticket)) throw new Error('Executable tickets must pass through in-progress and review before done');
      if (command.status === 'done') {
        for (const required of ticket.requires) if (ticketById(board, required).status !== 'done') throw new Error(`Ticket ${ticket.id} requires ${required} to be done`);
        for (const child of board.tickets.filter((item) => item.parent === ticket.id)) {
          if (child.status !== 'done' && !explicitAbandonment(board, child)) throw new Error(`Cannot close parent ${ticket.id}: child ${child.id} must be done or explicitly abandoned`);
        }
      }
      if (['review', 'done'].includes(command.status) && !command.validation?.length) throw new Error(`${command.status} requires fresh acceptance/validation evidence`);
      ticket.status = command.status;
      ticket.handoff = command.handoff;
      if (command.validation) ticket.validation = command.validation;
      break;
    }
    case 'handoff': {
      const ticket = ticketById(board, command.ticket);
      if (!ACTIVE.has(ticket.status)) throw new Error('Session handoffs must update the current occupied ticket without releasing its slot');
      requireHandoff(command.handoff, ticket.id);
      ticket.handoff = command.handoff;
      if (command.validation) ticket.validation = command.validation;
      break;
    }
    case 'decision': {
      const decision = command.decision;
      if (Date.parse(decision.at) > Date.parse(context.now)) throw new Error('User decision timestamp cannot be in the future');
      if (decision.kind === 'switch') {
        if (decision.fromTicket === null || !ACTIVE.has(ticketById(board, decision.fromTicket).status)) throw new Error('Switch decisions must name the current active ticket');
        if (decision.toTicket !== null && !['ready', 'paused'].includes(ticketById(board, decision.toTicket).status)) throw new Error('Switch destination must be ready or paused');
      } else if (decision.batchId === null || batchById(board, decision.batchId).status !== 'checkpoint') throw new Error('PR/defer decisions must name the current delivery checkpoint');
      board.decisions.push(decision);
      break;
    }
    case 'switch': {
      const ticket = ticketById(board, command.from);
      if (!ACTIVE.has(ticket.status)) throw new Error(`Ticket ${ticket.id} does not occupy the execution slot`);
      const decision = decisionById(board, command.decision);
      if (decision.kind !== 'switch' || decision.fromTicket !== command.from || decision.toTicket !== command.to || decision.disposition === null) throw new Error('Switch must exactly match the recorded user from/to/disposition decision');
      checkSettled(board, ticket.id);
      requireHandoff(command.handoff, ticket.id);
      ticket.status = decision.disposition;
      ticket.handoff = command.handoff;
      if (command.to !== null) startTicket(board, command.to, command.owner, context.now);
      break;
    }
    case 'batch': {
      if (board.batches.some((batch) => batch.status !== 'closed')) throw new Error('An existing delivery batch must reach its user PR/defer checkpoint and close before opening another scope');
      if (board.tickets.some((ticket) => ACTIVE.has(ticket.status))) throw new Error('Cannot open another batch while a ticket occupies the execution slot');
      if (command.batch.status !== 'open' || command.batch.prUrl !== null) throw new Error('A new batch must be open without a claimed PR');
      board.batches.push(command.batch);
      break;
    }
    case 'checkpoint': {
      const batch = batchById(board, command.batch);
      if (batch.status !== 'open') throw new Error('Only an open batch can reach the PR checkpoint');
      if (board.tickets.some((ticket) => ACTIVE.has(ticket.status))) throw new Error('Complete work or obtain a user pause/abandon decision and settle assignments before the batch checkpoint');
      for (const id of batch.tickets) checkSettled(board, id);
      batch.status = 'checkpoint';
      break;
    }
    case 'close-batch': {
      const batch = batchById(board, command.batch);
      if (batch.status !== 'checkpoint') throw new Error('Batch must be at its user PR checkpoint before closing');
      for (const id of batch.tickets) checkSettled(board, id);
      const decision = decisionById(board, command.decision);
      if (decision.batchId !== batch.id || decision.kind === 'switch') throw new Error('Batch closure requires its matching user PR-created or defer-pr decision');
      if (decision.kind === 'pr-created') {
        if (!command.prUrl || !prUrlValid(command.prUrl, board.policy.repository)) throw new Error('PR-created closure needs the verified repository PR URL');
        batch.prUrl = command.prUrl;
      } else if (command.prUrl !== undefined) throw new Error('A deferred PR decision cannot claim a PR URL');
      batch.status = 'closed';
      break;
    }
    case 'assign': {
      const assignment = command.assignment;
      if (assignment.status !== 'assigned' || assignment.handoff !== null) throw new Error('New assignments must be assigned without a claimed return');
      if (ticketById(board, assignment.ticket).status !== 'in-progress') throw new Error('Workers may only assist the current in-progress ticket');
      board.assignments.push(assignment);
      break;
    }
    case 'return': {
      const assignment = assignmentById(board, command.assignment);
      if (context.actor !== 'coordinator' && context.actor !== assignment.agent) throw new Error('Only the assigned worker or coordinator can return its work');
      if (assignment.status !== 'assigned') throw new Error('Only an assigned worker can return; accepted/returned work cannot be overwritten');
      requireHandoff(command.handoff, assignment.ticket);
      assignment.handoff = command.handoff;
      assignment.status = 'returned';
      break;
    }
    case 'accept': {
      const assignment = assignmentById(board, command.assignment);
      if (assignment.status !== 'returned') throw new Error('Persist a worker return before accepting the assignment');
      assignment.status = 'accepted';
      break;
    }
  }
  board.revision += 1;
  board.history.push({ id: board.revision, at: context.now, actor: context.actor, action: command.action, detail: JSON.stringify(command) });
  requireValid(validateBoard(board));
  return board;
}
