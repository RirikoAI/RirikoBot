export function normalizeTitle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when either title contains the other after stripping punctuation and case. */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}
