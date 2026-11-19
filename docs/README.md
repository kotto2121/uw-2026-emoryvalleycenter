# Greenhouse documentation

Greenhouse is a desktop dashboard for Emory Valley Center (EVC). It runs entirely on one Windows laptop. It turns the monthly PHS event export and the behavioral health roster into dashboards and ready-made reports.

## For Kristen and other staff

| Document | What it covers |
|---|---|
| [User guide](user-guide.md) | The monthly routine: install, import, review matches, read the dashboards, export reports. |
| [Metrics and definitions](metrics.md) | What every number means, how it is counted, which Data Metric Goals are covered, and what works without the Word roster. |
| [Troubleshooting](troubleshooting.md) | Windows blocking the app, import errors, odd numbers, starting over. |

## For the people maintaining it

| Document | What it covers |
|---|---|
| [Data sources and parsing](data-sources-and-parsing.md) | Exactly how the Excel export and the Word roster are read, step by step, with every rule and fallback. |
| [Person matching](person-matching.md) | How names from different files are linked without a client ID, and the Review Queue. |
| [Architecture](architecture.md) | Components, data model, startup sequence, build and CI. |
| [Privacy and security](privacy-and-security.md) | How patient data is protected, what isn't covered yet, and the rules for test data. |
| [Developer guide](developer-guide.md) | Setup, testing, common maintenance tasks, adding a new data source. |
| [Limitations and open questions](limitations-and-open-questions.md) | Known gaps, risks, and the decisions EVC still needs to make. |

## Background material

- [`chatgpt-prompt.md`](chatgpt-prompt.md): the prompts used on EVC's ChatGPT to learn the real file structures without exposing patient data.
- [`chatgpt-outputs/`](chatgpt-outputs/): what those prompts returned (structure and counts only).
- [`../api/README.md`](../api/README.md): the local API's routes.
