# Documentation index

One file per system. Start here, then open only the doc for the thing
you're actually touching — none of these assume you've read the others.

| Doc | Covers |
|---|---|
| [localization.md](localization.md) | The i18n/translation system: how it's built, how to add a language, how to add a translated string or a whole new page, and the bugs already hit and fixed here. |
| [ordering-system.md](ordering-system.md) | The order flow's product spec (menu, cutoff, delivery pricing, fulfillment) and its build history. |
| [deployment.md](deployment.md) | Hosting split (frontend/backend/database), CI/CD pipelines, secrets, the FTP/FTPS security tradeoff, rollback. |

Backend-specific docs live next to the backend code instead of here, since
they're maintained as part of that codebase:

| Doc | Covers |
|---|---|
| [../worker/CLAUDE.md](../worker/CLAUDE.md) | How to run and maintain the order API backend. |
| [../worker/ARCHITECTURE.md](../worker/ARCHITECTURE.md) | How the backend fits together internally. |

For anything not covered by a specific doc above — who this project is for,
overall decisions, working preferences — see [../CLAUDE.md](../CLAUDE.md)
at the repo root.

## Adding a new doc

One system, one file, kebab-case name, added to the table above. If a doc
would cover two unrelated systems, split it — that's the whole point of
this structure over one growing CLAUDE.md.
