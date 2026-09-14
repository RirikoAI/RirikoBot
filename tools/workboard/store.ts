import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { applyCommand, parseBoard } from './model.ts';
import { git, verifyGit } from './git.ts';
import { renderBoard } from './render.ts';
import type { Board, Command, MutationContext } from './types.ts';

export const serialize = (board: Board): string => `${JSON.stringify(board, null, 2)}\n`;

export function commonDirectory(root: string): string {
  return resolve(root, git(root, ['rev-parse', '--git-common-dir']), 'ririko-workboard');
}

function atomicWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, data, { flag: 'wx' }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export function withLock<T>(root: string, operation: () => T): T {
  const directory = commonDirectory(root);
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'lock');
  let handle: number;
  try { handle = openSync(path, 'wx'); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(`Another session holds ${path}. Stop; inspect the owner before recovering a stale lock. Never auto-delete it.`, { cause: error });
    throw error;
  }
  try { writeFileSync(handle, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), root })); return operation(); }
  finally { closeSync(handle); unlinkSync(path); }
}

export function readBoard(root: string, checkShared = true): Board {
  const board = parseBoard(JSON.parse(readFileSync(resolve(root, '.workboard/state.json'), 'utf8')) as unknown);
  const shared = resolve(commonDirectory(root), 'state.json');
  if (checkShared && existsSync(shared) && serialize(board) !== serialize(parseBoard(JSON.parse(readFileSync(shared, 'utf8')) as unknown))) throw new Error('This checkout has stale or manually changed board state. Read the shared handoff; reconcile with board sync before work.');
  return board;
}

export function checkHandoffs(root: string, board: Board): void {
  for (const handoff of [...board.tickets.map((entry) => entry.handoff), ...board.assignments.map((entry) => entry.handoff)].filter((entry): entry is string => entry !== null)) {
    if (!/^\.workboard\/handoffs\/RIR-\d+\/[^\r\n]+\.md$/.test(handoff)) throw new Error(`Invalid handoff path: ${handoff}`);
    const target = realpathSync(resolve(root, handoff));
    const fromRoot = relative(realpathSync(root), target);
    if (!fromRoot.startsWith(`.workboard${sep}handoffs${sep}`)) throw new Error('Handoff resolves outside the repository handoff directory.');
    const distance = relative(realpathSync(resolve(root, '.workboard/handoffs')), target);
    if (isAbsolute(distance) || distance === '..' || distance.startsWith(`..${sep}`)) throw new Error('Handoff escapes the versioned handoff directory.');
    if (!readFileSync(target, 'utf8').trim()) throw new Error(`Empty handoff: ${handoff}`);
  }
}

export function initializeShared(root: string): void {
  withLock(root, () => {
    const board = readBoard(root);
    checkHandoffs(root, board);
    atomicWrite(resolve(commonDirectory(root), 'state.json'), serialize(board));
  });
}

export function mutate(root: string, command: Command, expected: number, context: MutationContext): Board {
  return withLock(root, () => {
    if (!existsSync(resolve(commonDirectory(root), 'state.json'))) throw new Error('Install repository hooks before changing the board.');
    const board = readBoard(root);
    if (board.revision !== expected) throw new Error(`Stale revision ${expected}; current revision is ${board.revision}. Re-read the board.`);
    if (board.batches.some((entry) => entry.status !== 'closed')) verifyGit(root, board);
    if (command.action === 'close-batch') {
      const batch = board.batches.find((entry) => entry.id === command.batch);
      if (!batch || git(root, ['rev-parse', 'HEAD']) === batch.baseSha) throw new Error('Preserve a local delivery commit before closing the batch.');
      const changed = [
        ...git(root, ['diff', 'HEAD', '--name-only', '--no-renames', '-z', '--']).split('\0'),
        ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
      ].filter(Boolean);
      if (changed.some((path) => !path.startsWith('.workboard/'))) throw new Error('Commit the delivery code before closing/defer; only closing board metadata may remain uncommitted.');
    }
    const next = applyCommand(board, command, context);
    if (command.action === 'batch') verifyGit(root, next);
    checkHandoffs(root, next);
    atomicWrite(resolve(commonDirectory(root), 'state.json'), serialize(next));
    // The shared copy is written first: interrupted projection is recovered explicitly with sync.
    atomicWrite(resolve(root, '.workboard/state.json'), serialize(next));
    atomicWrite(resolve(root, '.workboard/BOARD.md'), renderBoard(next));
    return next;
  });
}

export function synchronize(root: string): void {
  withLock(root, () => {
    const shared = parseBoard(JSON.parse(readFileSync(resolve(commonDirectory(root), 'state.json'), 'utf8')) as unknown);
    const batch = shared.batches.find((entry) => entry.status !== 'closed');
    if (batch && git(root, ['branch', '--show-current']) !== batch.branch) throw new Error(`Shared work belongs to ${batch.branch}. Read its handoff instead of switching scope.`);
    const current = readFileSync(resolve(root, '.workboard/state.json'), 'utf8');
    const backup = resolve(commonDirectory(root), `recovery-${Date.now()}-${process.pid}.json`);
    writeFileSync(backup, current, { flag: 'wx' });
    checkHandoffs(root, shared);
    atomicWrite(resolve(root, '.workboard/state.json'), serialize(shared));
    atomicWrite(resolve(root, '.workboard/BOARD.md'), renderBoard(shared));
  });
}
