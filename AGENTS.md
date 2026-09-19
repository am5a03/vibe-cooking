# Agent guide

Vibe Cooking is a single-user recipe studio built with Next.js, Cloudflare
Workers/OpenNext, D1, Drizzle, and source-owned shadcn/ui components.

## Essentials

- Use Node 22.16+ within Node 22 (see [package.json](package.json) and
  [.nvmrc](.nvmrc)), npm, and the committed lockfile; install with `npm ci`.
- For code changes, start with `npm run typecheck`, `npm test`, and `npm run lint`.
  `npm run build:worker` builds the deployment target; `npm run build` alone does
  not validate the Worker. Choose additional checks from the testing guide below.
- Keep the change scoped. Preserve existing user data, local configuration, and
  unrelated work. Do not expose secrets, merge, deploy, or operate on remote D1
  without explicit authorization.

## Read when relevant

| Task | Guidance |
| --- | --- |
| Planning, local setup, or a PR | [Workflow and boundaries](docs/agents/WORKFLOW.md) |
| Choosing checks or debugging CI | [Testing](docs/agents/TESTING.md) |
| Schema, migrations, or catalogue writes | [Database changes](docs/agents/DATABASE.md) |
| Components, styles, forms, or confirmations | [UI architecture](docs/UI.md) |
| API or authentication | [API contract](docs/API.md), [browser access](docs/BROWSER-ACCESS.md), [origin configuration](docs/LOCAL-ORIGIN.md) |
| Discovery, preferences, or recipe variations | [Discovery and Remix](docs/DISCOVERY-REMIX.md) |
| Flavour profiles or recipe classifiers | [Flavour library](docs/FLAVOUR-LIBRARY.md) |
| Dependency changes | [Dependency policy](docs/DEPENDENCIES.md) |

Load only the guides needed for the task. Check the current implementation and
scripts before relying on historical setup examples; update affected guidance
alongside a behavior change rather than duplicating it here.
