/** True for IANA zone names the runtime knows, e.g. `Asia/Kuala_Lumpur`. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical IANA name for user input, matched case-insensitively (`asia/tokyo` → `Asia/Tokyo`).
 * Offsets and abbreviations are rejected so stored zones always follow DST rules.
 */
export function canonicalTimeZone(input: string): string | null {
  const wanted = input.trim().replace(/\s+/g, '_').toLowerCase();
  if (!wanted) return null;
  if (wanted === 'utc' || wanted === 'etc/utc') return 'UTC';
  return Intl.supportedValuesOf('timeZone').find((zone) => zone.toLowerCase() === wanted) ?? null;
}
