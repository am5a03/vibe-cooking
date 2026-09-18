# Agent instructions

Vibe Cooking (MealSpin) is a private, single-user recipe kitchen built with
Next.js on Cloudflare Workers/OpenNext, D1 and Drizzle.

## Essentials

Use Node 22.16+ within the Node 22 line and npm with the committed lockfile
(`npm ci`). Run commands from the repository root. Typecheck with
`npm run typecheck`; the deployment-target build is `npm run build:worker`,
not just `npm run build`.

Preserve the user's kitchen data, private access and existing local configuration.
Deployments, remote D1 access, data imports and secret changes require explicit
authorization; routine verification must not reset the user's local database.

## Read for the task

Read [the development workflow](docs/agents/WORKFLOW.md) before making changes;
it covers verification, source-of-truth rules and PR handoff. Open only the other
guides relevant to the work:

| Work | Guidance |
| --- | --- |
| UI, styling, forms or interaction | [Existing UI architecture and contracts](docs/UI.md) |
| API, sessions, validation or recipe data | [Backend boundaries](docs/agents/BACKEND.md) |
| Schema, migrations or D1 recovery | [Database workflow](docs/agents/DATABASE.md) |
| Discovery, exclusions or recipe variations | [Discovery and Remix](docs/DISCOVERY-REMIX.md) |
| Catalogue content or imports | [Recipe pack](docs/RECIPE-PACK.md) and [database safeguards](docs/agents/DATABASE.md) |

Keep this entry point small. Put task-specific details in their owning guide and
link to existing contracts rather than copying them here.
