// Flexible name normalization + Levenshtein-based fuzzy matching for
// settlement/uezd auto-detection. Used by the map's "probable match" indices
// and by the unlocated → located lookup.
//
// Goals:
//  - reduce misses: tolerate typos, variant transliterations, place-type
//    prefixes ("село", "г.", "village"), parenthetical clarifications,
//    diacritics, soft signs, and ё/й fluctuations
//  - reduce false positives: bound edit distance by length so short
//    different names ("Гори" vs "Гари") still won't collide

const PLACE_PREFIXES = [
  // Russian
  "село", "сел", "с", "деревня", "дер", "д",
  "город", "гор", "г",
  "посёлок", "поселок", "пос", "п",
  "слобода", "слоб", "сл",
  "местечко", "мест", "м",
  "хутор", "хут", "х",
  "станица", "стан", "ст",
  "урочище", "ур",
  "монастырь", "мон",
  "крепость", "креп",
  // English
  "village", "town", "city", "hamlet", "settlement", "fort", "fortress",
  "saint", "st",
  // Georgian
  "სოფელი", "სოფ", "ქალაქი", "ქ", "დაბა", "დ",
];

const PLACE_PREFIX_RE = new RegExp(
  "^(?:" + PLACE_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\.?\\s+",
  "iu",
);

/** Aggressive normalization: lowercase, strip diacritics, drop parentheticals
 *  and place-type prefixes, fold near-equivalent letters, collapse punctuation. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);

  // Drop parenthetical clarifications: "Цхинвали (южн.)" → "Цхинвали"
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");

  // Lowercase (locale-aware) + Unicode NFKD + strip combining marks (diacritics)
  s = s.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Normalize quotes/dashes/punctuation to spaces
  s = s.replace(/[''`"„""«»‚‛‟]/g, " ");
  s = s.replace(/[.,;:!?·•/\\|()\[\]{}<>]+/g, " ");
  s = s.replace(/[\-–—_]+/g, " ");

  // Strip leading place-type prefix (repeat in case of "с. дер. ...")
  for (let i = 0; i < 3; i++) {
    const next = s.replace(PLACE_PREFIX_RE, "").trim();
    if (next === s.trim()) break;
    s = next;
  }

  // Cyrillic letter folding: ё→е, й→и, щ→ш, ъ/ь dropped
  s = s
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(/щ/g, "ш")
    .replace(/[ъь]/g, "");

  // Common Russian/Georgian transliteration vowel fluctuations
  s = s
    .replace(/іi/g, "и")
    .replace(/і/g, "и")
    .replace(/ї/g, "и")
    .replace(/є/g, "е");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// Admin-division suffix/prefix tokens. Different historical sources label the
// same territory as "уезд", "район", "округ", "губерния", "область",
// "district", "county", "region", "okrug", "guberniya", "oblast", "mazra"
// (georgian მაზრა), etc. These tokens carry no identity — they describe the
// administrative *kind*, not the place. Strip them so that
// "Тифлисский уезд" and "Тифлисский район" normalize to the same key and
// merge during dedup.
const ADMIN_TOKENS = [
  // Russian
  "уезд", "уезда", "уезде", "уезду", "уездов",
  "район", "района", "районе", "районы", "районов",
  "округ", "округа", "округе", "округу", "округов",
  "губерния", "губернии", "губерниях", "губерний",
  "область", "области", "областях", "областей", "обл",
  "край", "края", "крае", "краев",
  "волость", "волости",
  // English
  "uezd", "raion", "rayon", "okrug", "guberniya", "gubernia",
  "oblast", "krai", "region", "district", "county", "province",
  // Georgian
  "მაზრა", "მაზრის", "ოლქი", "ოლქის", "რეგიონი", "რეგიონის",
  "რაიონი", "რაიონის", "გუბერნია", "გუბერნიის",
];

const ADMIN_TOKEN_RE = new RegExp(
  "(?:^|\\s)(?:" +
    ADMIN_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
    ")(?=\\s|$)",
  "giu",
);

/** Normalize an admin-division label (uezd / район / округ / district / ...).
 *  Returns a key suitable for equality comparison and bucketing: strips the
 *  admin-kind token and applies the same folding as `normalizeName`. */
export function normalizeAdmin(input: string | null | undefined): string {
  if (!input) return "";
  // First strip admin tokens, then run through name normalization so all the
  // diacritic/punctuation/letter-folding rules apply consistently.
  const stripped = String(input).replace(ADMIN_TOKEN_RE, " ");
  return normalizeName(stripped);
}

/** Iterative Levenshtein with two rolling rows. O(n*m) time, O(min(n,m)) memory. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Ensure b is the shorter one for memory
  if (a.length < b.length) { const t = a; a = b; b = t; }
  const n = a.length, m = b.length;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[m];
}

/** Length-aware threshold: ~1 edit per 5 chars, min 1 for ≥4-char strings. */
export function fuzzyThreshold(len: number): number {
  if (len < 4) return 0;          // short names must match exactly
  if (len < 7) return 1;
  if (len < 12) return 2;
  return Math.floor(len / 5);
}

/** True when two raw strings refer to (probably) the same place. */
export function isProbableMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Containment for multi-word names ("нижний хвити" ⊂ "хвити нижний")
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  const minLen = Math.min(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return dist <= fuzzyThreshold(minLen);
}

/** Similarity score in [0,1] — useful for ranking candidates. */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}
