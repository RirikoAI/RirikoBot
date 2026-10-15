import { describe, expect, it } from 'vitest';
import { describeMissingToken } from './missing-token.js';

describe('describeMissingToken', () => {
  it('names the missing variable, pnpm installer and the Docker command in docs/deployment.md', () => {
    const text = describeMissingToken().join('\n');
    expect(text).toContain('DISCORD_TOKEN');
    expect(text).toContain('pnpm installer');
    expect(text).toContain('ririko setup --docker');
    expect(text).toContain('docs/deployment.md');
  });
});
