export function searchMatches(text: string, query: string) {
  const normalized = text.toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (token) =>
        normalized.includes(token) ||
        (token.length >= 4 &&
          normalized.split(/[^\p{L}\p{N}]+/u).some((word) => oneEditApart(token, word))),
    );
}
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
const KEY = "jpi.recentSearches";
export function recentSearches(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string" && v.length <= 80).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}
export function rememberSearch(term: string) {
  const clean = term.trim().slice(0, 80);
  if (!clean) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [clean, ...recentSearches().filter((v) => v.toLowerCase() !== clean.toLowerCase())].slice(
          0,
          5,
        ),
      ),
    );
  } catch {
    /* Storage is optional. */
  }
}
export function clearSearches() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Storage is optional. */
  }
}
