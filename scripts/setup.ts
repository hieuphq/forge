#!/usr/bin/env bun
// scripts/setup.ts — the ONE personalisation script both init paths invoke
// (path A: `bun create hieuphq/forge myapp && bun run setup`;
// path B: the local hook or guarded root-postinstall fallback).
//
// Everything here MUST be idempotent: running `bun run setup` twice in the
// same scaffolded directory must be a no-op the second time for anything
// already personalised (see the JWT_SECRET guard below in particular).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OLD_SCOPE = "@yourorg/";
const TEMPLATE_ROOT_NAME = "forge";
const TEMPLATE_DB_NAME = "forge";

function fail(message: string): never {
  console.error(`[setup] ${message}`);
  process.exit(1);
}

// --- 1. Derive + sanitise the project name from the destination directory ---

/**
 * npm package names: lowercase, URL-safe. We're stricter than npm's own
 * cap (214 chars) — 100 is plenty for a real project name and keeps
 * generated identifiers (docker service names, etc.) sane.
 */
function sanitiseNpmName(raw: string): string {
  let name = raw.toLowerCase();
  name = name.replace(/[^a-z0-9-]+/g, "-");
  // npm forbids a leading dot or underscore; since those are already folded
  // into "-" above, also strip any leading/trailing "-" left over.
  name = name.replace(/^-+/, "").replace(/-+$/, "");
  name = name.replace(/-{2,}/g, "-");
  if (name.length > 100) {
    name = name.slice(0, 100).replace(/-+$/, "");
  }
  return name;
}

/**
 * Postgres unquoted identifiers: must start with a letter or underscore,
 * then letters/digits/underscores/dollar signs, folded to lowercase, capped
 * at 63 bytes. This is a different charset than npm's (no hyphens allowed),
 * so we sanitise separately rather than reusing the npm-safe name verbatim.
 */
function sanitisePostgresName(raw: string): string {
  let name = raw.toLowerCase();
  name = name.replace(/[^a-z0-9_]+/g, "_");
  name = name.replace(/^_+/, "").replace(/_+$/, "");
  name = name.replace(/_{2,}/g, "_");
  if (/^[0-9]/.test(name)) {
    name = `_${name}`;
  }
  if (name.length > 63) {
    name = name.slice(0, 63).replace(/_+$/, "");
  }
  return name;
}

const dirName = path.basename(ROOT);
const projectName = sanitiseNpmName(dirName);

if (!projectName) {
  fail(
    `could not derive a valid package name from directory "${dirName}" — ` +
      `it sanitises to an empty string (rename the directory to include at ` +
      `least one letter or digit and re-run 'bun run setup').`,
  );
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) {
  fail(
    `sanitised project name "${projectName}" (from directory "${dirName}") ` +
      `is not a valid npm package name — refusing to write a broken package.json.`,
  );
}

const dbName = sanitisePostgresName(projectName) || "app_db";

console.log(`[setup] project name: ${projectName}`);
console.log(`[setup] postgres db name: ${dbName}`);

// --- 2. Rename root package.json + every @yourorg/* reference tree-wide ---

const rootPkgPath = path.join(ROOT, "package.json");
const rootPkgRaw = readFileSync(rootPkgPath, "utf8");
const rootPkg = JSON.parse(rootPkgRaw);

if (rootPkg.name === TEMPLATE_ROOT_NAME || rootPkg.name !== projectName) {
  rootPkg.name = projectName;
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
  console.log(`[setup] root package.json name -> "${projectName}"`);
} else {
  console.log("[setup] root package.json name already up to date");
}

// Find every file under the tree (excluding node_modules/.git/dist) that
// still references the template scope, and rewrite it. This single pass
// covers workspace package.json "name" fields, dependency references, AND
// source import statements — they all contain the literal "@yourorg/"
// substring.
function findFilesWithOldScope(): string[] {
  try {
    const out = execFileSync(
      "grep",
      [
        "-rl",
        OLD_SCOPE,
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        ".",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((relPath) => {
        // Keep control scripts verbatim: each intentionally contains the old
        // scope as a sentinel. Rewriting them would corrupt future setup,
        // first-install detection, or verification.
        const normalised = relPath.replace(/^\.\//, "");
        return !new Set([
          path.join("scripts", "setup.ts"),
          path.join("scripts", "postinstall.ts"),
          path.join("scripts", "verify.sh"),
        ]).has(normalised);
      });
  } catch (err: any) {
    // grep exits 1 when there are no matches — that's success (nothing to do).
    if (err && typeof err.status === "number" && err.status === 1) {
      return [];
    }
    throw err;
  }
}

const filesToRewrite = findFilesWithOldScope();
const newScope = `@${projectName}/`;

if (filesToRewrite.length === 0) {
  console.log(`[setup] no "${OLD_SCOPE}" references found (already personalised)`);
} else {
  for (const relPath of filesToRewrite) {
    const filePath = path.join(ROOT, relPath);
    const content = readFileSync(filePath, "utf8");
    const rewritten = content.split(OLD_SCOPE).join(newScope);
    if (rewritten !== content) {
      writeFileSync(filePath, rewritten);
    }
  }
  console.log(
    `[setup] rewrote ${filesToRewrite.length} file(s): "${OLD_SCOPE}" -> "${newScope}"`,
  );
}

// --- 3. Create .env from .env.example (idempotent: never clobber an existing .env) ---

const envPath = path.join(ROOT, ".env");
const envExamplePath = path.join(ROOT, ".env.example");
const PLACEHOLDER_SECRET = "change-me-in-setup";

function generateJwtSecret(): string {
  return randomBytes(32).toString("base64url");
}

if (!existsSync(envPath)) {
  if (!existsSync(envExamplePath)) {
    fail(".env.example not found — cannot create .env");
  }
  copyFileSync(envExamplePath, envPath);
  let envContent = readFileSync(envPath, "utf8");

  // 4. Project-specific Postgres DB name (both DATABASE_URL and POSTGRES_DB
  // reference the same template literal, so a single replace covers both).
  envContent = envContent.split(TEMPLATE_DB_NAME).join(dbName);

  // Real generated secret, never Math.random().
  const secret = generateJwtSecret();
  envContent = envContent.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);

  writeFileSync(envPath, envContent);
  console.log("[setup] created .env from .env.example (generated JWT_SECRET, set DB name)");
} else {
  // .env already exists — never overwrite DB name / other values a dev may
  // have customised locally. Only fix JWT_SECRET if it's still the
  // template's placeholder (or missing), and never regenerate an already
  // real secret — that's the idempotency contract.
  let envContent = readFileSync(envPath, "utf8");
  const match = envContent.match(/^JWT_SECRET=(.*)$/m);
  const currentSecret = match?.[1]?.trim() ?? "";

  if (!currentSecret || currentSecret === PLACEHOLDER_SECRET) {
    const secret = generateJwtSecret();
    if (match) {
      envContent = envContent.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
    } else {
      envContent += `${envContent.endsWith("\n") ? "" : "\n"}JWT_SECRET=${secret}\n`;
    }
    writeFileSync(envPath, envContent);
    console.log("[setup] .env existed with a placeholder JWT_SECRET — generated a real one");
  } else {
    console.log("[setup] .env already exists with a real JWT_SECRET — leaving it untouched");
  }
}

// --- 4b. docker-compose.yml default POSTGRES_DB fallback ---
//
// docker-compose.yml already reads POSTGRES_DB dynamically from `.env` via
// `env_file: .env` (TASK-004) — `${POSTGRES_DB:-forge}` — so
// once `.env` exists with the new project DB name, the compose file's own
// fallback is never actually used for a personalised project. We still
// update the literal fallback value here (not strictly required, but it
// keeps `docker-compose.yml` internally consistent / readable on its own,
// and the replace is naturally idempotent — replacing the same value with
// itself on a second run is a no-op).

const composePath = path.join(ROOT, "docker-compose.yml");
if (existsSync(composePath)) {
  const composeContent = readFileSync(composePath, "utf8");
  const rewrittenCompose = composeContent.split(TEMPLATE_DB_NAME).join(dbName);
  if (rewrittenCompose !== composeContent) {
    writeFileSync(composePath, rewrittenCompose);
    console.log(`[setup] docker-compose.yml default POSTGRES_DB fallback -> "${dbName}"`);
  } else {
    console.log("[setup] docker-compose.yml already up to date");
  }
}

// --- 4c. Deployment scaffolds ---
//
// The template ships optional Docker/k3s helpers. Keep them readable in the
// template checkout (forge/yourorg placeholders), then personalise project-local
// defaults after scaffolding so generated manifests reference the app name.

function rewriteIfExists(relPath: string, replacements: Array<[string, string]>): boolean {
  const filePath = path.join(ROOT, relPath);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  let rewritten = content;
  for (const [from, to] of replacements) rewritten = rewritten.split(from).join(to);
  if (rewritten === content) return false;
  writeFileSync(filePath, rewritten);
  return true;
}

const deploymentReplacements: Array<[string, string]> = [
  ["yourorg/forge", `yourorg/${projectName}`],
  ["forge.example.com", `${projectName}.example.com`],
  ["api.forge.example.com", `api.${projectName}.example.com`],
  ["forge", projectName],
];

const deploymentFiles = [
  "deploy/k3s/namespace.yaml",
  "deploy/k3s/configmap.yaml",
  "deploy/k3s/secret.example.yaml",
  "deploy/k3s/postgres.yaml",
  "deploy/k3s/api.yaml",
  "deploy/k3s/web.yaml",
  "deploy/k3s/migrate-job.yaml",
  "deploy/k3s/ingress.yaml",
  "deploy/k3s/kustomization.yaml",
  "deploy/k3s/README.md",
];

let rewrittenDeployFiles = 0;
for (const relPath of deploymentFiles) {
  if (rewriteIfExists(relPath, deploymentReplacements)) rewrittenDeployFiles += 1;
}
if (rewrittenDeployFiles > 0) {
  console.log(`[setup] personalised ${rewrittenDeployFiles} deployment helper file(s)`);
} else {
  console.log("[setup] deployment helpers already up to date");
}

// --- 5. Replace the template README with a project-specific guide ---

const readmePath = path.join(ROOT, "README.md");
const templateReadmeMarker = "A fullstack Bun monorepo template.";
const projectReadme = `# ${projectName}

A fullstack Bun monorepo with a Hono API, React web app, Expo mobile app,
experimental ReactLynx target, and shared packages.

Scaffolded from [forge](https://github.com/hieuphq/forge).

## Quick start

\`\`\`sh
bun install
docker compose up -d
bun run db:generate
bun run db:migrate
\`\`\`

Start the API and web app in separate terminals:

\`\`\`sh
bun run --filter '@${projectName}/api' dev
bun run --filter '@${projectName}/web' dev
\`\`\`

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API health | http://localhost:3000/health |
| PostgreSQL | localhost:5433 |

## Workspaces

- \`apps/api\` — Hono API, Prisma/PostgreSQL example CRUD, and auth.
- \`apps/web\` — Vite, React, Tailwind, and shadcn/ui SPA.
- \`apps/mobile\` — Expo app; run with \`bun run --filter '@${projectName}/mobile' start\`.
- \`apps/mobile-lynx\` — experimental ReactLynx target; safe to delete if unused.
- \`packages/shared\` — shared error taxonomy.
- \`packages/lib\` — framework-agnostic helpers.

## Environment

\`bun run setup\` creates the gitignored root \`.env\`. The main settings are:

| Variable | Purpose |
| --- | --- |
| \`DATABASE_URL\` | API connection to PostgreSQL |
| \`POSTGRES_DB\`, \`POSTGRES_USER\`, \`POSTGRES_PASSWORD\` | Local Compose database |
| \`JWT_SECRET\` | Local JWT signing secret generated by setup |
| \`PORT\` | API port; defaults to \`3000\` |
| \`CORS_ALLOWED_ORIGINS\` | Comma-separated browser origin allowlist |
| \`VITE_API_URL\` | Optional local Vite dev fallback for the web app |
| \`API_URL\` | Runtime public API URL written to web \`/config.js\` by Docker/k3s |

See \`.env.example\` for defaults and descriptions. Never commit \`.env\`.

## Docker runtime config

The web Docker image is immutable across environments. At container startup,
\`apps/web/docker-entrypoint.d/40-runtime-config.sh\` writes \`/config.js\` from
runtime \`API_URL\`, defaulting to \`http://localhost:3000\`.

For k3s, set \`API_URL\` from a ConfigMap. This value is public browser config,
not a Secret; reserve Secrets for server-side values like database passwords,
JWT secrets, and S3/object-storage keys.

## Verification

With PostgreSQL running:

\`\`\`sh
bash scripts/verify.sh
\`\`\`

Focused checks are also available:

\`\`\`sh
bun run typecheck
bun run lint
bun test
bun run --workspaces --if-present build
\`\`\`

## Known limitations

- Authentication uses persistent Prisma users with role-based access.
- There is no refresh token; logout deletes the cookie but cannot revoke an
  already-issued JWT.
- \`apps/api/src/modules/projects\` is a demo project/expense variance board intended
  to be replaced or adapted to your domain code.
- \`apps/mobile-lynx\` is experimental and independent from the Expo app.
- Docker Compose provisions PostgreSQL, API, and web for local container checks.
- \`deploy/k3s/\` is a minimal Kubernetes scaffold; review images, hosts, storage,
  secrets, and ingress before production use.
- \`_docs/RED-MONITORING.md\` is a proposal, not an implemented monitoring stack.

Before production use, review the security notes in
\`apps/api/src/modules/auth/README.md\`, configure production secrets, and replace demo domain code as needed.

## Development guidance

Repository structure, module boundaries, error conventions, and agent commands
are documented in [AGENTS.md](./AGENTS.md).
`;

if (!existsSync(readmePath)) {
  writeFileSync(readmePath, projectReadme);
  console.log("[setup] created README.md");
} else {
  const existing = readFileSync(readmePath, "utf8");
  if (existing === projectReadme) {
    console.log("[setup] README.md already up to date");
  } else if (existing.includes(templateReadmeMarker)) {
    writeFileSync(readmePath, projectReadme);
    console.log("[setup] replaced template README.md with project guide");
  } else {
    console.log("[setup] README.md appears customised — leaving it untouched");
  }
}

// --- 6. Next steps ---

console.log("");
console.log(
  "Setup complete! Next: docker compose up -d && bun run db:generate && bun run db:migrate",
);
