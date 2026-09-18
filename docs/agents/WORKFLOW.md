# Workflow and boundaries

Read this for planning, local configuration, or preparing a pull request.

## Start from the current project

Inspect the branch, working tree, touched implementation, and nearby tests before
editing. For new work, branch from the latest `main`; when continuing an existing
PR, retain that branch and its changes. Do not reset, force-push, or overwrite
unrelated work. Some [README](../../README.md) checkout examples describe earlier
feature branches, not the branch to use for a new task.

Keep changes incremental and behavior-preserving unless the task explicitly
changes behavior. This is a private, single-user kitchen. Accounts, public sharing,
AI generation, image storage, and shared prep sessions are not implied by a UI or
maintenance request. Read the relevant product contract before changing recipe
versions, authored portions, preferences, or remix approval.

## Local setup and secrets

Use the pinned Node/npm setup from [AGENTS.md](../../AGENTS.md). Inspect
[package.json](../../package.json) for the current scripts and
[README](../../README.md) for setup. Follow
[DEPENDENCIES.md](../DEPENDENCIES.md) for intentional dependency updates.

Preserve an existing `.dev.vars`, API_TOKEN, KITCHEN_ORIGIN, Wrangler configuration,
and local database state. Copy `.dev.vars.example` only for a genuinely new local
setup, not over an existing file. Never put keys or session cookies in commits,
logs, screenshots, PR text, `NEXT_PUBLIC_*`, or browser localStorage.

For a same-site error, compare KITCHEN_ORIGIN with the actual browser origin,
including scheme, hostname, and port. Do not weaken Origin or session checks to
fix a local configuration mismatch. Use [LOCAL-ORIGIN.md](../LOCAL-ORIGIN.md) and
[BROWSER-ACCESS.md](../BROWSER-ACCESS.md).

## Review and release

Run the applicable [checks](TESTING.md) and review the diff, including generated
files and the lockfile. A PR handoff should describe the change, checks actually
run, failures or skipped checks, and any configuration or migration requirements.
Do not describe unrun checks as passing.

Opening a PR does not authorize merging it. The existing
[deployment workflow](../../.github/workflows/deploy.yml) publishes pushes to
`main`; leave that decision to the user. Do not trigger a deployment, operate on
remote D1, or apply a catalogue import without explicit authorization. For database
changes, arrange the reviewed migration sequence in [DATABASE.md](DATABASE.md)
before a merge that would deploy dependent code.

## Maintain the instructions

Keep root instructions limited to essentials and task links. Add durable,
project-specific guidance to its existing topic; do not append generic style
rules, temporary task notes, or a full repository map. Prefer executable checks
for mechanically enforceable conventions. Verify relative links after moves.

`CLAUDE.md` is a symlink to `AGENTS.md`, so both entry points share one source.
Keep it a link rather than a second copy of the instructions. This structure uses
[AI Hero's progressive-disclosure approach](https://www.aihero.dev/a-complete-guide-to-agents-md).
