import { z } from 'zod';

/** Punishments a warning escalation step can apply. */
export const ESCALATION_ACTIONS = ['WARN', 'TIMEOUT', 'KICK', 'BAN'] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];

/** Discord's longest member timeout: 28 days. */
export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export interface EscalationStep {
  /** Warning points (the sum of active warning severities) at which the step applies. */
  warnThreshold: number;
  action: EscalationAction;
  /** Timeout length; only used by `TIMEOUT` steps. */
  durationSeconds?: number | undefined;
}

/** Policy used by guilds that never saved their own. */
export const DEFAULT_ESCALATION_STEPS: readonly EscalationStep[] = [
  { warnThreshold: 1, action: 'WARN' },
  { warnThreshold: 2, action: 'WARN' },
  { warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 600 },
  { warnThreshold: 4, action: 'TIMEOUT', durationSeconds: 3600 },
  { warnThreshold: 5, action: 'TIMEOUT', durationSeconds: 86_400 },
  { warnThreshold: 6, action: 'BAN' },
];

export const MAX_ESCALATION_STEPS = 20;

export const EscalationStepSchema = z
  .object({
    warnThreshold: z
      .number({ invalid_type_error: 'Warning points must be a whole number.' })
      .int('Warning points must be a whole number.')
      .min(1, 'Warning points must be at least 1.')
      .max(100, 'Warning points must be 100 or less.'),
    action: z.enum(ESCALATION_ACTIONS, {
      errorMap: () => ({ message: 'Choose warn, timeout, kick or ban.' }),
    }),
    // A length left blank in the dashboard arrives as null: report it as missing.
    durationSeconds: z.preprocess(
      (value) => (value === null ? undefined : value),
      z
        .number({ invalid_type_error: 'Timeout length must be a whole number of seconds.' })
        .int('Timeout length must be a whole number of seconds.')
        .min(60, 'Timeouts must last at least 1 minute.')
        .max(MAX_TIMEOUT_SECONDS, 'Timeouts can last at most 28 days.')
        .optional(),
    ),
  })
  .strict()
  .superRefine((step, ctx) => {
    if (step.action === 'TIMEOUT' && step.durationSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationSeconds'],
        message: 'Timeout steps need a length.',
      });
    }
    if (step.action !== 'TIMEOUT' && step.durationSeconds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationSeconds'],
        message: 'Only timeout steps have a length.',
      });
    }
  });

/** A whole escalation policy: unique thresholds, sorted from the lowest. An empty list turns escalation off. */
export const EscalationPolicySchema = z
  .array(EscalationStepSchema, { invalid_type_error: 'Enter the steps as a list.' })
  .max(MAX_ESCALATION_STEPS, `A policy can have at most ${MAX_ESCALATION_STEPS} steps.`)
  .superRefine((steps, ctx) => {
    const seen = new Set<number>();
    for (const step of steps) {
      if (seen.has(step.warnThreshold)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Two steps start at ${step.warnThreshold} warning points; each step needs its own threshold.`,
        });
        return;
      }
      seen.add(step.warnThreshold);
    }
  })
  .transform((steps) => [...steps].sort((a, b) => a.warnThreshold - b.warnThreshold));

/** Actions an AutoMod rule can take. Every match also deletes the message. */
export const AUTOMOD_ACTIONS = ['DELETE', 'WARN', 'TIMEOUT', 'KICK', 'BAN'] as const;
export type AutoModConfigurableAction = (typeof AUTOMOD_ACTIONS)[number];

/** How long an AutoMod `TIMEOUT` lasts. */
export const AUTOMOD_TIMEOUT_SECONDS = 600;

export const AUTOMOD_RULE_TYPES = [
  'INVITE_FILTER',
  'PHISHING_SHIELD',
  'MENTION_SPAM',
  'BURST_SPAM',
] as const;
export type AutoModRuleTypeName = (typeof AUTOMOD_RULE_TYPES)[number];

export interface AutoModRuleDefaults {
  isEnabled: boolean;
  action: AutoModConfigurableAction;
  /** Only mention and burst spam read a threshold. */
  threshold?: number;
}

/** What each AutoMod rule does in a guild that has no stored row for it. */
export const AUTOMOD_RULE_DEFAULTS: Readonly<Record<AutoModRuleTypeName, AutoModRuleDefaults>> = {
  INVITE_FILTER: { isEnabled: true, action: 'DELETE' },
  PHISHING_SHIELD: { isEnabled: true, action: 'DELETE' },
  MENTION_SPAM: { isEnabled: true, action: 'DELETE', threshold: 5 },
  BURST_SPAM: { isEnabled: true, action: 'DELETE', threshold: 5 },
};
