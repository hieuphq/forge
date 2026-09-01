# forge

A fullstack Bun monorepo template. Bun workspaces tie together two apps that
ship (API, web), two mobile targets, and two shared libraries:

- `apps/api` — Hono HTTP API + Prisma/PostgreSQL
- `apps/web` — Vite + React 19 + Tailwind v4 + shadcn/ui SPA
- `apps/mobile` — Expo app
- `apps/mobile-lynx` — **EXPERIMENTAL** ReactLynx target, safe to delete
- `packages/shared` — cross-cutting error taxonomy
- `packages/lib` — small framework-agnostic helpers

Scaffold a new project from this template, then personalise it with
`bun run setup` (rewrites the `@yourorg/*` package scope, project name, and
generates real local secrets). The example API slice persists through Prisma;
run `docker compose up -d && bun run db:migrate` before using it.

## Getting started

There are two entry paths, depending on where you're running from.

### Path A — portable

```
bun create hieuphq/forge myapp
cd myapp
bun run setup
```

### Path B — owner's machine (local template)

Symlink this repo into Bun's local template directory:

```
mkdir -p ~/.bun-create
ln -s /absolute/path/to/this/repo ~/.bun-create/forge
```

Then scaffold with:

```
bun create forge myapp
```

No second command is needed. Bun 1.3.13 currently prints the documented
`bun-create.postinstall` command without executing it (reproduced with minimal
local templates), so a guarded root `postinstall` delegates to the same
idempotent `bun run setup`. The template checkout itself is never personalised.

### Why two paths?

The portable GitHub path keeps an explicit `bun run setup` because remote
scaffolding does not provide the local-template lifecycle guarantee. The local
path is one command because dependency installation invokes the guarded
fallback above. Both paths converge on `scripts/setup.ts`; the fallback is only
a dispatch guard, not a second personalization implementation.

## Next steps

Once scaffolded and set up, see `AGENTS.md` in the generated project for repo
layout, how to run things, and conventions.
