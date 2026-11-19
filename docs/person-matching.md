# Person matching

Neither the PHS export nor the Word roster has a client ID or date of birth. The only thing they share is the person's **name**, written differently in each:

| Source | Typical format | Notes |
|---|---|---|
| PHS event export | `Gentry, Kenneth` | 100% "Last, First" in the real export. Sometimes a middle initial or ALL CAPS. |
| BH roster (Word) | `Kenny Gentry` | 100% "First Last". Nicknames, typos and trailing status notes occur. |

Greenhouse therefore keeps its own **person registry**: each person gets a stable internal ID, and every spelling ever seen is stored as an **alias** pointing to that ID. All dashboards count people by this ID, never by name text.

**Code:** `db/names.js` (parsing and similarity), `db/people.js` (registry, rules, merges), `app/pages/review.js` (Review Queue).

## Matching rules, in order

For every name in every imported file:

1. **Exact alias.** This exact text (ignoring case and extra spaces) was seen before, so it's the same person. Example: `GENTRY, KENNETH` = `Gentry, Kenneth`.
2. **ID-like name.** If the name contains a digit (`Member 104`, `Person 2973`, a client number), it's an identifier, not a spelling. It's matched **exactly only** and never fuzzily, otherwise every token would look like a near-duplicate of every other one. A new token becomes a new person.
3. **Normalized match.** After normalization (below), the same *last name + first name* means the same person. Linked automatically and saved as a new alias. Example: `Gentry, Kenneth A.` = `Kenneth Gentry`.
4. **Otherwise a new person** is created immediately, so dashboards are never missing anyone. Then the **most similar existing person** is looked up. If the similarity score is **≥ 0.82** and the pair hasn't been marked "different people", one **Review Queue** item is created: "are these the same person?"

### Normalization (`parseName`)

- Accents are stripped (José → Jose) and text is lower-cased.
- `Last, First Middle` and `First Middle Last` are both understood.
- Suffixes are dropped: Jr, Sr, II, III, IV, V, 2nd, 3rd.
- Nicknames in quotes or parentheses are captured: `Robert "Bobby" Smith`.
- Middle names and initials are ignored for the match key.
- Spaces and hyphens inside surnames are ignored, so `Smith-Jones` = `Smith Jones`.
- The match key is `last|first`, e.g. `gentry|kenneth`.

### Similarity score (`scoreNames`, 0 to 1)

`0.55 × last-name similarity + 0.45 × first-name similarity`, using Jaro–Winkler string similarity. The surname is weighted higher because it's rarely abbreviated. First names get extra credit for:

| Case | First-name similarity |
|---|---|
| Identical | 1.00 |
| Nickname in quotes matches | 0.97 |
| Common nickname pair (≈60 groups: Kenneth/Kenny/Ken, William/Bill, Deborah/Debbie …) | 0.96 |
| First name matches the other's middle name | 0.90 |
| Initial vs full name (J / John) | 0.85 |
| One side has no first name | 0.60 |
| Otherwise | Jaro–Winkler |

First and last names swapped (`Smith John` typed without a comma) are also tested, with a small penalty. Each Review Queue card shows the score and a plain-English reason ("last names nearly identical (possible typo); same first name").

## The Review Queue

- **Same person — merge (M).** All event records, roster rows and aliases move to one person, and the other record is deleted. By default the person with **more records** is kept, so a one-off typo doesn't become the display name. Open questions that mentioned the removed person are re-pointed. The decision is permanent: that spelling now links by rule 1.
- **Different people (D).** The pair is remembered and never suggested again.
- Only one question is created per new person (the best candidate).

The first import of real data needs the most review. After that, most names link through rules 1–3. ChatGPT's count-only check on real files (6 months of events vs one roster) found 35 normalized matches, 6 nickname or prefix matches, no typo-only matches and no ambiguous matches, among 103 roster names. The other 62 roster clients simply had no events in that period.

## Known limitations

- **Two different people with the same name** (same first and last name after normalization) are linked automatically by rule 3. There's no date of birth or ID to tell them apart. If this happens, the People screen shows one person with both sets of records, and there's currently no "split" button. Mitigation: add a client ID to the exports, or match on name **and** site in a future version.
- **A changed surname** (marriage, legal name change) becomes a new person. The Review Queue only catches it if the first name and enough of the surname are similar.
- **Nicknames outside the list** (≈60 groups in `db/names.js`) are only caught if the spellings are similar. Extend `NICKNAME_GROUPS` as new pairs come up.
- **The threshold 0.82** is a judgement call, tested on demo data with typos and nicknames. Raise it to reduce questions or lower it to catch more. It's `REVIEW_THRESHOLD` in `db/people.js`.
- **Undoing an import** removes people who no longer have any records, but **merges are not undone**.

## If EVC can add an ID

If PHS can add an Individual ID (or date of birth) to both exports, add it as a column and match on it first, before rule 1. Name matching then becomes a fallback, and the same-name problem disappears. This is the single most valuable improvement to data quality.
