/** Repository-owned workflow data. Points measure relative effort, not elapsed time. */
export type TicketType = 'epic' | 'story' | 'task' | 'chore' | 'bug' | 'spike';
export type Status = 'backlog' | 'ready' | 'in-progress' | 'blocked' | 'paused' | 'review' | 'done' | 'abandoned';
export interface Ticket {
  id: string; type: TicketType; title: string; status: Status;
  parent: string | null; requires: string[]; deliveryScope: string;
  estimate: number | null; estimateRationale: string; groomedIn: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3'; acceptance: string[]; paths: string[];
  owner: string | null; handoff: string | null; validation: string[];
}
export interface Grooming {
  id: string; scope: string; at: string; participants: string[];
  tickets: string[]; rationale: string;
}
export interface Decision {
  id: string; kind: 'switch' | 'defer-pr' | 'pr-created'; reference: string; at: string;
  fromTicket: string | null; toTicket: string | null;
  disposition: 'paused' | 'abandoned' | null; batchId: string | null;
}
export interface Assignment {
  id: string; ticket: string; agent: string; scope: string; paths: string[];
  status: 'assigned' | 'returned' | 'accepted'; handoff: string | null;
}
export interface Batch {
  id: string; scope: string; branch: string; baseBranch: string; baseSha: string;
  status: 'open' | 'checkpoint' | 'closed'; tickets: string[]; prUrl: string | null;
  /** Explicit user-approved dependency; parent scope is excluded only against this exact preserved commit. */
  stack?: { parentBatch: string; parentHead: string; decision: string };
}
export interface Event {
  id: number; at: string; actor: string; action: string; detail: string;
}
export interface Board {
  version: 1; revision: number;
  policy: { pointScale: number[]; wipLimit: 1; repository: string; remote: string; remoteUrl: string; baseBranch: string };
  tickets: Ticket[]; grooming: Grooming[]; decisions: Decision[];
  assignments: Assignment[]; batches: Batch[]; history: Event[];
}
export type Command =
  | { action: 'create'; ticket: Ticket }
  | { action: 'groom'; grooming: Grooming; estimates: Array<{ id: string; points: number; rationale: string }> }
  | { action: 'start'; ticket: string; owner: string }
  | { action: 'handoff'; ticket: string; handoff: string; reason: string; validation?: string[] }
  | { action: 'move'; ticket: string; status: Status; reason: string; handoff: string; validation?: string[] }
  | { action: 'switch'; from: string; to: string | null; decision: string; owner: string; handoff: string }
  | { action: 'decision'; decision: Decision }
  | { action: 'batch'; batch: Batch }
  | { action: 'stack'; batch: string; parentBatch: string; parentHead: string; decision: string }
  | { action: 'checkpoint'; batch: string }
  | { action: 'close-batch'; batch: string; decision: string; prUrl?: string }
  | { action: 'assign'; assignment: Assignment }
  | { action: 'return'; assignment: string; handoff: string }
  | { action: 'accept'; assignment: string };
export interface MutationContext { actor: string; now: string }
