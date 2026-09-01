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
generates real local secrets). The API includes a Prisma-backed project/expense variance-board demo;
run `docker compose up -d postgres && bun run db:migrate && bun run db:seed` before using it.

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

## Demo app

New projects include a small vertical slice: persistent users/roles, project
estimates, expenses with server-calculated totals, attachment metadata, and SSE
freshness events. Treat it as a working example to replace or adapt to your
actual domain.

Seed users are `owner@example.test`, `pm@example.test`, and
`worker@example.test`; default seed password is `password123`.

## Docker images and runtime config

The template includes Dockerfiles for both shipped apps:

- `apps/api/Dockerfile` uses a full Bun build stage and a slim Bun runtime stage.
- `apps/web/Dockerfile` builds the Vite bundle and serves it from Nginx.

The web image is immutable across environments. It loads `/config.js` before the
Vite bundle, and the container entrypoint writes the public browser config from
runtime env:

```sh
API_URL=https://api.example.com
```

If `API_URL` is unset, the web container defaults to `http://localhost:3000`.
`VITE_API_URL` is only an optional local Vite dev fallback and is not required
for Docker image builds.

For k3s, provide `API_URL` from a ConfigMap on the web Deployment. It is public
browser config, not a Secret. Use Secrets only for server-side values such as
database passwords, JWT secrets, and S3/object-storage keys.

## Next steps

Once scaffolded and set up, see `AGENTS.md` in the generated project for repo
layout, how to run things, and conventions.
