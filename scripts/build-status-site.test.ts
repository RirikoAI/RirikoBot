import { describe, expect, it } from 'vitest';
import { buildStatusModel, escapeHtml, renderStatusPage, type Board } from './build-status-site';

const board: Board = {
  epics: [
    { id: 'EPIC-001', title: 'Core', points: 13, status: 'DONE' },
    { id: 'EPIC-002', title: 'Dashboard <web>', points: 21, status: 'TODO' },
  ],
  stories: [
    { id: 'STORY-010', epic: 'EPIC-001', title: 'Router', points: 5, status: 'DONE' },
    { id: 'STORY-011', epic: 'EPIC-001', title: 'Dropped', points: 8, status: 'ABANDONED' },
    { id: 'STORY-020', epic: 'EPIC-002', title: 'Login', points: 3, status: 'DONE' },
    { id: 'STORY-021', epic: 'EPIC-002', title: 'Settings', points: 5, status: 'IN_PROGRESS' },
    { id: 'STORY-022', epic: 'EPIC-002', title: 'Charts', points: 2, status: 'TODO' },
    { id: 'STORY-023', epic: 'EPIC-002', title: 'Later', points: 8, status: 'BACKLOG' },
  ],
  tasks: [{ id: 'TASK-0211', parent: 'STORY-021', title: 'Form', points: 3, status: 'REVIEW' }],
  chores: [],
  bugs: [{ id: 'BUG-0001', parent: 'STORY-020', title: 'Crash', points: 1, status: 'TODO' }],
};

describe('buildStatusModel', () => {
  const model = buildStatusModel(board);

  it('counts story points per epic, skipping abandoned and separating backlog', () => {
    expect(model.epics).toEqual([
      expect.objectContaining({ id: 'EPIC-001', donePoints: 5, totalPoints: 5, backlogPoints: 0 }),
      expect.objectContaining({ id: 'EPIC-002', donePoints: 3, totalPoints: 10, backlogPoints: 8 }),
    ]);
    expect(model.donePoints).toBe(8);
    expect(model.totalPoints).toBe(15);
  });

  it('lists active tickets of every type and groomed stories, chores and bugs', () => {
    expect(model.active.map((t) => t.id)).toEqual(['STORY-021', 'TASK-0211']);
    expect(model.todo.map((t) => [t.id, t.parent])).toEqual([
      ['STORY-022', 'EPIC-002'],
      ['BUG-0001', 'STORY-020'],
    ]);
  });

  it('counts done tickets per type without abandoned ones', () => {
    expect(model.counts.find((c) => c.type === 'Stories')).toEqual({
      type: 'Stories',
      done: 2,
      total: 5,
    });
  });
});

describe('renderStatusPage', () => {
  it('escapes board text and links docs on the built branch', () => {
    const html = renderStatusPage(
      buildStatusModel(board),
      [{ path: 'docs/testing.md', title: 'Testing & "QA"' }],
      { branch: 'develop/2.0.0', sha: 'abc1234', builtAt: '2026-09-26 00:00 UTC' },
    );
    expect(html).toContain('Dashboard &lt;web&gt;');
    expect(html).not.toContain('Dashboard <web>');
    expect(html).toContain('Testing &amp; &quot;QA&quot;');
    expect(html).toContain(
      'https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/testing.md',
    );
    expect(html).toContain('53%');
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
