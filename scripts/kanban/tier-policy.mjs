// Standing model-tier rule (protocol.md section 1.2). A ticket's tier follows from its type and points;
// grooming does not choose it:
//   story or epic  → large  (Claude: Opus)
//   1 point        → small  (Claude: Haiku)
//   anything else  → medium (Claude: Sonnet)
// Only the user may set another tier, recorded on the ticket as "tier_override": { "tier", "reason" }.
// render-board.mjs, worker-delegation.mjs, and the installer's upgrade share this module.

export const TIERS = ['small', 'medium', 'large'];
export const CLAUDE_MODEL = { small: 'haiku', medium: 'sonnet', large: 'opus' };

// t.type is the ticket type ("story", "task", ...), derived from its board.json group.
export const policyTier = (t) => (t.type === 'story' || t.type === 'epic' ? 'large' : t.points === 1 ? 'small' : 'medium');

export const requiredTier = (t) => t.tier_override?.tier ?? policyTier(t);

// Returns why the ticket breaks the tier rule, or null. Closed tickets are history and are not checked.
export function tierProblem(t) {
  if (['DONE', 'ABANDONED'].includes(t.status)) return null;
  const o = t.tier_override;
  if (o != null && (!TIERS.includes(o.tier) || typeof o.reason !== 'string' || !o.reason.trim())) {
    return `tier_override needs "tier" (${TIERS.join(', ')}) and a "reason" that records the user's approval`;
  }
  const want = requiredTier(t);
  if (!t.model || t.model === want) return null;
  const rule = o ? 'its user-approved tier_override' : t.type === 'story' || t.type === 'epic' ? `the rule for a ${t.type}` : t.points === 1 ? 'the rule for 1 pt' : 'the rule for 2+ pts';
  return `model is "${t.model}", but ${rule} requires "${want}". Only the user may change it, with "tier_override": { "tier", "reason" } (protocol 1.2)`;
}
