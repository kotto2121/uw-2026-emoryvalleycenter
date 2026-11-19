# Limitations and open questions

## Questions for EVC

These need a decision from EVC, not code.

| # | Question | Why it matters | Current behavior |
|---|---|---|---|
| 1 | Can PHS add an **Individual ID** (or date of birth) to the event export and the roster? | Removes almost all name matching and the same-name risk. | Name matching with a Review Queue. |
| 2 | What is the **"Additional Caseload"** table in the roster: OP, PSR, or something else? | Changes OP/PSR counts. | Not imported unless the user picks a service in the preview. |
| 3 | Which **month** does a roster dated "Updated <date>" represent? | Assigns enrollment to the right month. | The month of the "Updated" date; editable at import. |
| 4 | Is **"Crisis events"** an acceptable stand-in for "crisis calls"? PHS has no crisis-call option. | Board reporting. | Behavioral Crisis options + Mobile Crisis services. |
| 5 | Should **hospitalizations** include medical admissions, or psychiatric only? | The Data Metric Goal is in the Behavioral Health section. | Both. |
| 6 | Who should be able to **import**, and should anyone have a **dashboard-only view without names**? | Roles and privacy. | Everyone using the laptop sees everything. |
| 7 | Can IT **allow the app to run** (Smart App Control / AppLocker), or should EVC **code-sign** it? | Whether it runs at all on managed laptops. | Unsigned. |
| 8 | Is **BitLocker** on for this laptop? | Encryption at rest. | Not verified. |
| 9 | Who produces the roster, and could it come as **Excel** instead of Word? | Excel is far more reliable to parse than tables in a Word document. | Word parser tuned to the current layout. |

## Known limitations

### Data and parsing

- **The Word parser is tuned to one layout** (see [data sources](data-sources-and-parsing.md#2-behavioral-health-caseload-document-docx)). Big layout changes need code changes. The preview's "matches heading total" check is the early warning. Text boxes, images of tables and `.doc` files aren't read.
- **Only one sheet per Excel file** is imported: the one with the most event rows. If someone splits an export across sheets, import each part as its own file.
- **Option lists come from what's known today.** New PHS options appear as "Unrecognized option" until added to `db/classify.js`; the import warning lists them. The yes/no indicators use patterns and are more forgiving.
- **Property damage under $100** only counts if a narrative mentions it.
- **"Other Event Types" narratives** are stored as-is and can contain names and details. They're searchable on the Incidents page.
- **Exact duplicate rows** are assumed to be double entries and excluded; two genuinely identical events would be under-counted by one.
- **Incomplete-month detection** only looks at the newest month and uses a 5-day rule. A genuinely quiet final week could be mislabelled, and the mislabelling only shows as a banner.
- The manual workbook's **"Type" tab** isn't reproduced, because it needs an "Incident Types" column the raw export doesn't have.

### People

- **Same-name people are merged automatically**, and there's no "split" action yet ([details](person-matching.md#known-limitations)).
- **Merges can't be undone** from the app (restore a backup instead).
- **Surname changes** create a new person unless the Review Queue catches them.

### App and platform

- **Unsigned.** Windows SmartScreen warns, and **Smart App Control blocks it outright**, as do some IT policies. Fixes: IT allow-listing, or code signing (e.g. Microsoft Trusted Signing, about $10/month after EVC's identity is verified).
- **Single user, single laptop.** The database is a local file with no sync or sharing. Several authorized staff entering data (a stated goal) would need a shared database or a hosted service, which isn't possible under the current constraints.
- **No encryption at rest** beyond BitLocker, no user accounts, no audit log ([privacy](privacy-and-security.md)).
- **Windows x64 only** is built. macOS and Linux builds work from source but aren't packaged.
- **No automated test suite** yet; checks are scripted by hand ([developer guide](developer-guide.md#testing)).
- **Placeholder logo and colors** until EVC's brand assets are provided.

### Scope

- **Only Behavioral Health and Incidents are live.** The other 13 programs in the Data Metric Goals are roadmap pages that list their metrics and the data each needs.
- **BCBA services** (a Behavioral Health goal) need a BCBA caseload source.
- **No data entry forms.** Data only comes in through file imports.
