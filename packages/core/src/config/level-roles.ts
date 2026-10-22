import { z } from 'zod';

export const MAX_LEVEL_ROLE_REWARDS = 25;
export const MAX_REWARD_LEVEL = 1000;

/**
 * One level role reward: the role Ririko gives a member who reaches `level`. The shape matches
 * `LevelRoleReward` in `@ririko/database`, where the list is stored.
 */
export interface LevelRoleReward {
  level: number;
  roleId: string;
}

const SNOWFLAKE = /^\d{17,20}$/;
const LEVEL_MESSAGE = `Level must be a whole number from 1 to ${MAX_REWARD_LEVEL}.`;
const ROLE_MESSAGE = 'Choose a role.';

export const LevelRoleRewardSchema = z
  .object({
    level: z
      .number({ invalid_type_error: LEVEL_MESSAGE, required_error: LEVEL_MESSAGE })
      .int(LEVEL_MESSAGE)
      .min(1, LEVEL_MESSAGE)
      .max(MAX_REWARD_LEVEL, LEVEL_MESSAGE),
    roleId: z
      .string({ required_error: ROLE_MESSAGE, invalid_type_error: ROLE_MESSAGE })
      .regex(SNOWFLAKE, ROLE_MESSAGE),
  })
  .strict();

/**
 * A guild's level role rewards: at most 25, each level and each role used once, sorted by level
 * so equal lists compare equal.
 */
export const LevelRoleRewardsSchema = z
  .array(LevelRoleRewardSchema, { invalid_type_error: 'Enter the rewards as a list.' })
  .max(
    MAX_LEVEL_ROLE_REWARDS,
    `A server can have at most ${MAX_LEVEL_ROLE_REWARDS} level role rewards.`,
  )
  .superRefine((rewards, ctx) => {
    const levels = new Set<number>();
    const roles = new Set<string>();
    rewards.forEach((reward, index) => {
      if (levels.has(reward.level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'level'],
          message: 'This level already has a reward.',
        });
      }
      if (roles.has(reward.roleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'roleId'],
          message: 'This role is already a reward.',
        });
      }
      levels.add(reward.level);
      roles.add(reward.roleId);
    });
  })
  .transform((rewards): LevelRoleReward[] => [...rewards].sort((a, b) => a.level - b.level));
