import { describe, it, expect } from 'vitest';
import {
  REACTION_CATALOG,
  REACTION_NAMES,
  getReaction,
  searchReactions,
} from '../reactions.catalog.js';

// Legacy count is hard-coded (not cross-checked against .local/RirikoBot, which is not shipped):
// .local/RirikoBot/src/command/reactions/*.command.ts holds exactly 68 non-spec command files.
const LEGACY_REACTION_COUNT = 68;

describe('REACTION_CATALOG (TASK-1301)', () => {
  it('has exactly the number of entries the legacy reactions directory contains', () => {
    expect(REACTION_CATALOG).toHaveLength(LEGACY_REACTION_COUNT);
    expect(REACTION_NAMES).toHaveLength(LEGACY_REACTION_COUNT);
  });

  it('has unique names across every entry', () => {
    const names = REACTION_CATALOG.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has unique reactionType slugs across every entry', () => {
    const types = REACTION_CATALOG.map((r) => r.reactionType);
    expect(new Set(types).size).toBe(types.length);
  });

  it('has no duplicate aliases, within or across entries', () => {
    const allAliases = REACTION_CATALOG.flatMap((r) => r.aliases ?? []);
    expect(new Set(allAliases).size).toBe(allAliases.length);

    for (const reaction of REACTION_CATALOG) {
      if (!reaction.aliases) continue;
      expect(new Set(reaction.aliases).size).toBe(reaction.aliases.length);
    }
  });

  it('has a non-empty description, content, and noTargetContent for every entry', () => {
    for (const reaction of REACTION_CATALOG) {
      expect(reaction.description.trim().length).toBeGreaterThan(0);
      expect(reaction.content.trim().length).toBeGreaterThan(0);
      expect(reaction.noTargetContent.trim().length).toBeGreaterThan(0);
    }
  });

  // Spot checks pin exact legacy phrasing so a paraphrase/typo regression fails loudly.
  it('preserves verbatim legacy phrasing for spot-checked reactions', () => {
    expect(getReaction('hug')).toMatchObject({
      name: 'hug',
      reactionType: 'hug',
      description: 'Wrap your arms around someone to show them some love and care!',
      content: 'wrapped themselves in a warm hug with',
      noTargetContent: 'wrapped themselves in a warm, self-comforting hug',
    });

    expect(getReaction('slap')).toMatchObject({
      name: 'slap',
      reactionType: 'slap',
      description: 'Deliver a powerful slap to someone.',
      content: 'delivered a devastating slap to',
      noTargetContent: 'slapped the air, their hand stinging from the force of it',
    });

    // stopit is the one legacy oddity: the command name is "stopit" but the otakugifs
    // reactionType slug is "stop" — preserved verbatim rather than "corrected".
    expect(getReaction('stopit')).toMatchObject({
      name: 'stopit',
      reactionType: 'stop',
      description: 'Tell someone to halt or cease whatever they’re doing.',
      content: 'firmly demanded a stop from',
      noTargetContent:
        'held up a hand and shouted "Stop!" into the empty air, standing their ground',
    });

    expect(getReaction('yay')?.description).toBe(
      'Express excitement or joy with a cheerful "Yay!"',
    );
  });
});

describe('getReaction (TASK-1301)', () => {
  it('resolves by primary name, case-insensitively', () => {
    expect(getReaction('poke')?.name).toBe('poke');
    expect(getReaction('POKE')?.name).toBe('poke');
    expect(getReaction('  poke  ')?.name).toBe('poke');
  });

  it('returns undefined for unknown reaction names', () => {
    expect(getReaction('not-a-real-reaction')).toBeUndefined();
  });
});

describe('searchReactions autocomplete filter (TASK-1301)', () => {
  it('ranks prefix matches before substring matches', () => {
    const results = searchReactions('la');
    const names = results.map((r) => r.name);

    // "laugh" is a prefix match; "slap" and others containing "la" only substring-match.
    expect(names[0]).toBe('laugh');
    expect(names).toContain('laugh');
  });

  it('is case-insensitive', () => {
    const lower = searchReactions('hu').map((r) => r.name);
    const upper = searchReactions('HU').map((r) => r.name);
    expect(upper).toEqual(lower);
    expect(lower).toContain('hug');
  });

  it('never returns more than 25 results', () => {
    // A single common letter should match well over 25 of the 68 entries via substring.
    const results = searchReactions('a');
    expect(results.length).toBeLessThanOrEqual(25);
  });

  it('returns the full catalog head (capped at 25) for a blank query', () => {
    const results = searchReactions('');
    expect(results).toHaveLength(25);
    expect(results[0]).toEqual(REACTION_CATALOG[0]);
  });

  it('returns an exact, unique match for a full reaction name', () => {
    const results = searchReactions('hug');
    expect(results[0]?.name).toBe('hug');
  });

  it('respects a caller-provided limit not exceeding the 25 cap', () => {
    const results = searchReactions('a', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
