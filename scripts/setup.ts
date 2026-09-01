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

// --- 5. Replace the template README with a project-specific stub ---

const readmePath = path.join(ROOT, "README.md");
const projectReadme = `# ${projectName}

Scaffolded from [forge](https://github.com/hieuphq/forge).

## Getting started

\`\`\`sh
bun install
bun run dev
\`\`\`

See \`.env\` for local configuration (generated by \`bun run setup\`).
`;

if (!existsSync(readmePath)) {
  writeFileSync(readmePath, projectReadme);
  console.log("[setup] created README.md");
} else {
  const existing = readFileSync(readmePath, "utf8");
  if (existing !== projectReadme) {
    writeFileSync(readmePath, projectReadme);
    console.log("[setup] replaced README.md with project stub");
  } else {
    console.log("[setup] README.md already up to date");
  }
}

// --- 6. Next steps ---

console.log("");
console.log("Setup complete! Run: bun install && bun run dev");
