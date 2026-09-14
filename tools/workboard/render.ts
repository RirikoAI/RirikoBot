import type { Board, Ticket } from './types.ts';

function cell(value: string | number | null | undefined): string { return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' '); }

/** Render the full board from its canonical data, including inverse relationships. */
export function renderBoard(board: Board): string {
  const active = board.tickets.filter((ticket) => ['in-progress', 'blocked', 'review'].includes(ticket.status));
  const batch = board.batches.find((entry) => entry.status !== 'closed');
  const lines = ['# Ririko work board', '', `Generated from state.json · revision ${board.revision} · execution limit **1**.`, '',
    `**Current work:** ${active.map((ticket) => `${ticket.id} — ${ticket.title} (${ticket.status}, ${ticket.estimate} points)`).join('; ') || 'No occupied ticket.'}`,
    `**Delivery:** ${batch ? `${batch.id} / ${batch.scope} / \`${batch.branch}\` → \`${batch.baseBranch}\` (${batch.status})` : 'No open batch.'}`, '',
    'Read [the standing protocol](PROTOCOL.md) and the current handoff before working. A new task while the slot is occupied requires the user’s pause/abandon decision. A new delivery scope requires the PR checkpoint decision.', ''];
  for (const status of ['in-progress', 'blocked', 'review', 'paused', 'ready', 'backlog', 'done', 'abandoned']) {
    const tickets = board.tickets.filter((ticket) => ticket.status === status);
    if (!tickets.length) continue;
    lines.push(`## ${status}`, '', '| ID | Type | Outcome | Points | Parent | Requires | Blocks | Delivery scope |', '|---|---|---|---:|---|---|---|---|');
    for (const ticket of tickets) {
      const blocks = board.tickets.filter((entry) => entry.requires.includes(ticket.id)).map((entry) => entry.id);
      lines.push(`| ${[ticket.id, ticket.type, ticket.title, ticket.estimate ?? 'Ungroomed', ticket.parent, ticket.requires.join(', ') || '—', blocks.join(', ') || '—', ticket.deliveryScope].map(cell).join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push('## Agent assignments', '', '| Assignment | Ticket | Agent | Status | Scope |', '|---|---|---|---|---|');
  for (const assignment of board.assignments) lines.push(`| ${[assignment.id, assignment.ticket, assignment.agent, assignment.status, assignment.scope].map(cell).join(' | ')} |`);
  lines.push('', '## Current handoffs', '');
  for (const ticket of active) if (ticket.handoff) lines.push(`- ${ticket.id}: [handoff](${ticket.handoff.replace(/^\.workboard\//, '')})`);
  lines.push('', '## Grooming groups', '');
  for (const grooming of board.grooming) lines.push(`- ${grooming.id}: ${grooming.scope} · ${grooming.tickets.join(', ')} · ${grooming.rationale}`);
  lines.push('', 'Parent estimates are planning sizes; sum leaf tickets only for delivery reporting. Backlog items with unknown estimates cannot start. Inspect full acceptance/ownership/history with `pnpm board show ID`.', '');
  return lines.join('\n');
}

/** Expanded view supports grooming without separately maintained ticket documents. */
export function ticketView(board: Board, ticket: Ticket): object {
  return { ...ticket, children: board.tickets.filter((entry) => entry.parent === ticket.id).map((entry) => entry.id), blocks: board.tickets.filter((entry) => entry.requires.includes(ticket.id)).map((entry) => entry.id) };
}
