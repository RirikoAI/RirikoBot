import { describe, expect, it } from 'vitest';
import {
  LevelRoleRewardsSchema,
  MAX_LEVEL_ROLE_REWARDS,
  MAX_REWARD_LEVEL,
  type LevelRoleReward,
} from './level-roles.js';

const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';

function issues(value: unknown): Array<[string, string]> {
  const result = LevelRoleRewardsSchema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]);
}

describe('LevelRoleRewardsSchema', () => {
  it('has the documented limits', () => {
    expect(MAX_LEVEL_ROLE_REWARDS).toBe(25);
    expect(MAX_REWARD_LEVEL).toBe(1000);
  });

  it('accepts an empty list', () => {
    expect(LevelRoleRewardsSchema.parse([])).toEqual([]);
  });

  it('sorts rewards by level so equal lists compare equal', () => {
    const rewards: LevelRoleReward[] = [
      { level: 20, roleId: B },
      { level: 1000, roleId: C },
      { level: 5, roleId: A },
    ];
    expect(LevelRoleRewardsSchema.parse(rewards)).toEqual([
      { level: 5, roleId: A },
      { level: 20, roleId: B },
      { level: 1000, roleId: C },
    ]);
    // The input list is not changed.
    expect(rewards[0]).toEqual({ level: 20, roleId: B });
  });

  it('rejects level 0, level 1001, a fraction and a non-number with a plain message', () => {
    const message = 'Level must be a whole number from 1 to 1000.';
    expect(issues([{ level: 0, roleId: A }])).toEqual([['0.level', message]]);
    expect(issues([{ level: 1001, roleId: A }])).toEqual([['0.level', message]]);
    expect(issues([{ level: 2.5, roleId: A }])).toEqual([['0.level', message]]);
    expect(issues([{ level: '5', roleId: A }])).toEqual([['0.level', message]]);
    expect(issues([{ roleId: A }])).toEqual([['0.level', message]]);
  });

  it('rejects a bad or missing role ID', () => {
    expect(issues([{ level: 5, roleId: 'Regular' }])).toEqual([['0.roleId', 'Choose a role.']]);
    expect(issues([{ level: 5, roleId: 123 }])).toEqual([['0.roleId', 'Choose a role.']]);
    expect(issues([{ level: 5 }])).toEqual([['0.roleId', 'Choose a role.']]);
  });

  it('points at the row that repeats a level or a role', () => {
    expect(
      issues([
        { level: 5, roleId: A },
        { level: 5, roleId: B },
        { level: 9, roleId: A },
      ]),
    ).toEqual([
      ['1.level', 'This level already has a reward.'],
      ['2.roleId', 'This role is already a reward.'],
    ]);
  });

  it('accepts 25 rewards and rejects 26', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        level: i + 1,
        roleId: `2000000000000000${10 + i}`,
      }));
    expect(LevelRoleRewardsSchema.safeParse(many(25)).success).toBe(true);
    expect(issues(many(26))).toEqual([['', 'A server can have at most 25 level role rewards.']]);
  });

  it('rejects unknown fields and a value that is not a list', () => {
    expect(LevelRoleRewardsSchema.safeParse([{ level: 5, roleId: A, name: 'x' }]).success).toBe(
      false,
    );
    expect(issues('Regular')).toEqual([['', 'Enter the rewards as a list.']]);
  });
});
