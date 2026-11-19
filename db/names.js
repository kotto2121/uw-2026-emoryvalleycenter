/**
 * db/names.js — name normalization + fuzzy similarity for person matching.
 *
 * Neither the PHS export nor the BH Word doc carries a client ID, so people are
 * matched on name strings. This module turns a raw name into comparable parts
 * and scores two names. It does NOT decide merges on its own: see
 * db/people.js, which auto-links only exact/normalized matches and sends fuzzy
 * ones to the Review Queue for a human to confirm.
 *
 * Handles: "Last, First Middle", "First Middle Last", case, punctuation,
 * diacritics, suffixes (Jr, Sr, II, III, IV), quoted/parenthesized nicknames
 * ('Robert "Bobby" Smith'), common nickname equivalents, middle initials.
 */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v", "2nd", "3rd"]);

// Common nickname groups. Any two names in the same group count as equivalent.
// Extend this list as the Review Queue reveals new pairs.
const NICKNAME_GROUPS = [
  ["robert", "rob", "robby", "robbie", "bob", "bobby", "bert"],
  ["william", "will", "willie", "bill", "billy", "liam"],
  ["richard", "rich", "richie", "rick", "ricky", "dick"],
  ["james", "jim", "jimmy", "jamie"],
  ["john", "johnny", "jack", "jon"],
  ["jonathan", "jon", "jonny", "nathan"],
  ["joseph", "joe", "joey"],
  ["michael", "mike", "mikey", "mick"],
  ["christopher", "chris", "topher"],
  ["christina", "chris", "christy", "tina"],
  ["christine", "chris", "christy", "tina"],
  ["thomas", "tom", "tommy"],
  ["charles", "charlie", "chuck", "chaz"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["matthew", "matt", "matty"],
  ["anthony", "tony"],
  ["andrew", "andy", "drew"],
  ["edward", "ed", "eddie", "ted", "teddy"],
  ["benjamin", "ben", "benny"],
  ["samuel", "sam", "sammy"],
  ["samantha", "sam", "sammy"],
  ["alexander", "alex", "xander", "al"],
  ["alexandra", "alex", "lexi", "sandra"],
  ["nicholas", "nick", "nicky"],
  ["stephen", "steve", "steven", "stevie"],
  ["timothy", "tim", "timmy"],
  ["gregory", "greg"],
  ["kenneth", "ken", "kenny"],
  ["ronald", "ron", "ronnie"],
  ["donald", "don", "donnie"],
  ["lawrence", "larry"],
  ["gerald", "gerry", "jerry"],
  ["patrick", "pat", "patty"],
  ["patricia", "pat", "patty", "trish", "tricia"],
  ["elizabeth", "liz", "lizzie", "beth", "betty", "eliza", "libby"],
  ["katherine", "kathy", "kate", "katie", "kat", "kathryn", "catherine"],
  ["margaret", "maggie", "meg", "peggy", "marge"],
  ["jennifer", "jen", "jenny"],
  ["jessica", "jess", "jessie"],
  ["rebecca", "becky", "becca"],
  ["susan", "sue", "susie"],
  ["deborah", "debbie", "deb"],
  ["victoria", "vicky", "tori"],
  ["abigail", "abby"],
  ["kimberly", "kim"],
  ["melissa", "missy", "mel"],
  ["pamela", "pam"],
  ["cynthia", "cindy"],
  ["dorothy", "dot", "dottie"],
  ["frederick", "fred", "freddie"],
  ["harold", "harry", "hal"],
  ["henry", "hank", "harry"],
  ["raymond", "ray"],
  ["zachary", "zach", "zack"],
  ["joshua", "josh"],
  ["jacob", "jake"],
  ["nathaniel", "nate", "nathan"],
  ["leonard", "leo", "len", "lenny"],
  ["theodore", "ted", "teddy", "theo"],
  ["douglas", "doug"],
  ["jeffrey", "jeff"],
  ["terrence", "terry"],
  ["teresa", "terri", "terry", "tess"],
];

const NICK = new Map();
NICKNAME_GROUPS.forEach((group, i) => {
  for (const n of group) {
    if (!NICK.has(n)) NICK.set(n, new Set());
    NICK.get(n).add(i);
  }
});

function areNicknames(a, b) {
  if (!a || !b) return false;
  const ga = NICK.get(a);
  const gb = NICK.get(b);
  if (!ga || !gb) return false;
  for (const g of ga) if (gb.has(g)) return true;
  return false;
}

function stripDiacritics(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Collapse a raw string for exact-alias lookups. */
function rawKey(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function titleCase(s) {
  return s.replace(/\b([a-z])([a-z']*)/g, (_, a, b) => a.toUpperCase() + b);
}

/**
 * Parse a raw name into { first, middle, last, nicknames[], key, display }.
 * key is 'last|first' — the normalized identity used for auto-linking.
 */
function parseName(raw) {
  let s = stripDiacritics(String(raw || "")).trim();
  const nicknames = [];
  // Pull out "Bobby" / (Bobby) nicknames.
  s = s.replace(/["“”(](.+?)["“”)]/g, (_, nick) => {
    nicknames.push(nick.toLowerCase().replace(/[^a-z]/g, ""));
    return " ";
  });
  s = s.toLowerCase();

  let first = "";
  let last = "";
  let middle = "";

  const clean = (t) => t.replace(/[^a-z' -]/g, "").replace(/'/g, "").trim();

  if (s.includes(",")) {
    // "Last, First Middle" (possibly "Last Jr., First")
    const [lastPart, ...rest] = s.split(",");
    const restTokens = rest.join(" ").split(/\s+/).map(clean).filter(Boolean)
      .filter((t) => !SUFFIXES.has(t));
    const lastTokens = lastPart.split(/\s+/).map(clean).filter(Boolean)
      .filter((t) => !SUFFIXES.has(t));
    last = lastTokens.join(" ");
    first = restTokens[0] || "";
    middle = restTokens.slice(1).join(" ");
  } else {
    const tokens = s.split(/\s+/).map(clean).filter(Boolean).filter((t) => !SUFFIXES.has(t));
    if (tokens.length === 1) {
      last = tokens[0];
    } else if (tokens.length >= 2) {
      first = tokens[0];
      last = tokens[tokens.length - 1];
      middle = tokens.slice(1, -1).join(" ");
    }
  }

  // Hyphens and spaces inside surnames are inconsistent in practice
  // ("Smith-Jones" vs "Smith Jones"); compare them without separators.
  const lastCmp = last.replace(/[\s-]/g, "");
  const firstCmp = first.replace(/[\s-]/g, "");

  return {
    first: firstCmp,
    middle,
    last: lastCmp,
    nicknames,
    key: `${lastCmp}|${firstCmp}`,
    display: titleCase([first, middle, last].filter(Boolean).join(" ")) || String(raw || "").trim(),
  };
}

// ---- Jaro–Winkler ---------------------------------------------------------

function jaro(a, b) {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let p = 0;
  while (p < 4 && p < a.length && p < b.length && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

function firstNameSimilarity(pa, pb) {
  const a = pa.first;
  const b = pb.first;
  if (!a || !b) return 0.6; // one side has no first name: weak evidence either way
  if (a === b) return 1;
  if (areNicknames(a, b)) return 0.96;
  if (pa.nicknames.includes(b) || pb.nicknames.includes(a)) return 0.97;
  // Initial vs full name ("J" vs "John").
  if ((a.length === 1 || b.length === 1) && a[0] === b[0]) return 0.85;
  // First and middle swapped / goes-by-middle-name.
  if (pa.middle && pa.middle.split(" ").includes(b)) return 0.9;
  if (pb.middle && pb.middle.split(" ").includes(a)) return 0.9;
  return jaroWinkler(a, b);
}

/**
 * Score how likely two raw names are the same person (0..1) and say why.
 * Weighted towards the surname, which is less often abbreviated.
 */
function scoreNames(rawA, rawB) {
  const pa = typeof rawA === "string" ? parseName(rawA) : rawA;
  const pb = typeof rawB === "string" ? parseName(rawB) : rawB;
  const lastSim = jaroWinkler(pa.last, pb.last);
  const firstSim = firstNameSimilarity(pa, pb);
  // Also try first/last swapped ("Smith John" typed without a comma).
  const swapped =
    0.55 * jaroWinkler(pa.last, pb.first) + 0.45 * jaroWinkler(pa.first, pb.last);
  const direct = 0.55 * lastSim + 0.45 * firstSim;
  const score = Math.max(direct, swapped - 0.03);

  const reasons = [];
  if (swapped - 0.03 > direct) reasons.push("first and last name appear swapped");
  else {
    if (lastSim === 1) reasons.push("same last name");
    else if (lastSim > 0.85) reasons.push("last names nearly identical (possible typo)");
    if (pa.first && pb.first && pa.first !== pb.first) {
      if (areNicknames(pa.first, pb.first)) reasons.push(`"${pa.first}" / "${pb.first}" are common nickname forms`);
      else if (pa.first[0] === pb.first[0] && (pa.first.length === 1 || pb.first.length === 1))
        reasons.push("first initial matches");
      else if (firstSim > 0.85) reasons.push("first names nearly identical (possible typo)");
    } else if (pa.first === pb.first && pa.first) reasons.push("same first name");
  }
  return { score: Math.round(score * 1000) / 1000, reason: reasons.join("; ") };
}

module.exports = { parseName, rawKey, scoreNames, jaroWinkler, areNicknames };
