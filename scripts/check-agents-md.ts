#!/usr/bin/env bun
/**
 * check-agents-md.ts — verifies every backticked path and command in the
 * root AGENTS.md actually resolves against the real repo tree. Exits
 * non-zero on the FIRST miss, naming what failed and why.
 *
 * ## Why this exists
 *
 * AGENTS.md is read by humans and agents as ground truth for "how do I run
 * this project". A renamed directory, a deleted script, or a typo'd command
 * silently rots the doc. This script is the mechanical backstop: run it in
 * CI (or by hand) and a stale reference fails loudly instead of wasting a
 * reader's time.
 *
 * ## What counts as a "backtick span"
 *
 * Both inline code spans (`` `like this` ``) and fenced code blocks
 * (``` ```like this``` ```) are extracted. Each line inside a fenced block
 * is treated as its own independent span (AGENTS.md's one fenced block is a
 * plain command list, one command per line, no shell continuations).
 *
 * ## Classifying a span: path vs. command vs. "don't know, skip it"
 *
 * A generic Markdown file mixes MANY kinds of backticked things: real file
 * paths, real shell commands, but also code identifiers (`AppError`), JSON
 * shape sketches (`{code, message}`), error-code strings that merely LOOK
 * like a path (`auth/UNAUTHENTICATED` has a slash but is not a filesystem
 * path), and placeholder text (`bun create <org>/name`). Blindly treating
 * "contains a slash" as "is a path" produces false failures on error codes;
 * blindly treating "first word" as "is a command" produces false failures
 * on things like `getUserMessage(code)`. So classification here is
 * deliberately conservative in both directions:
 *
 *   1. A span containing `<` or `>` is placeholder/template text (e.g.
 *      `bun create <org>/name`) — skipped entirely, not verified.
 *   2. A span starting with `@` is an npm package/scope name
 *      (`@yourorg/api`) — skipped, not a filesystem path from repo root.
 *   3. A span whose first whitespace-separated token is a KNOWN shell
 *      binary (see COMMAND_BINARIES below) is treated as a COMMAND.
 *        - `bun run <script>` (optionally with `--filter '<pkg>'` /
 *          `--workspaces` / `--if-present` flags before the script name) is
 *          cross-checked against every package.json's `scripts` map in the
 *          workspace (root + apps/* + packages/*) — the script name must
 *          exist in at least one of them. This catches a renamed/deleted
 *          npm script, which a bare `command -v bun` check would miss.
 *        - Any other command is checked by binary existence only
 *          (`command -v <first-word>`, e.g. `docker`, `git`, `rm`, `cd`).
 *          This is intentionally shallow: we do not exec every backticked
 *          command (some are destructive or slow — `docker compose up -d`,
 *          `rm -rf ...`), so a typo'd FLAG or a wrong subcommand will not be
 *          caught this way. Documented limitation, not a gap we pretend
 *          isn't there.
 *   4. Otherwise, a span is treated as a PATH candidate only if it starts
 *      with one of a small allowlist of real root-level prefixes for this
 *      repo (`apps/`, `packages/`, `scripts/`, `docs/`, a leading `.` for a
 *      dotfile, or the literal `docker-compose.yml`). This allowlist (not a
 *      bare "contains a slash") is what keeps error-code strings like
 *      `auth/UNAUTHENTICATED` and glob-ish snippets like `*.test.ts` from
 *      being misclassified as paths. The path is resolved relative to the
 *      repo root and checked with `existsSync`.
 *   5. Anything else (bare code identifiers like `AppError`, `Map`, object
 *      shapes like `{code, message}`, bare words like `test`, `shared`) is
 *      skipped — it is neither a checkable path nor a checkable command,
 *      and guessing would produce false positives/negatives either way.
 *
 * This is an honest, not exhaustive, check: it catches the mistake this
 * task cares about (a renamed backticked path, or a `bun run` script that
 * no longer exists), without false-failing on the many other things
 * Markdown legitimately puts in backticks.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const AGENTS_MD_PATH = join(ROOT, "AGENTS.md");

const COMMAND_BINARIES = new Set([
  "bun",
  "bunx",
  "docker",
  "git",
  "npm",
  "npx",
  "node",
  "rm",
  "cd",
  "tsc",
]);

// bun-run flags known to consume the NEXT token as a value (so that value
// is not mistaken for the script name).
const BUN_FLAGS_WITH_VALUE = new Set(["--filter"]);

const PATH_PREFIXES = ["apps/", "packages/", "scripts/", "docs/"];

function fail(span: string, reason: string): never {
  console.error(`✗ check:agents-md FAILED`);
  console.error(`  span:   \`${span}\``);
  console.error(`  reason: ${reason}`);
  process.exit(1);
}

// --- 1. Extract backtick spans from AGENTS.md -------------------------------

function extractSpans(markdown: string): string[] {
  const spans: string[] = [];

  // Fenced blocks first, then strip them out so the inline-span regex
  // below doesn't also match the ``` fence markers or block contents.
  const fencedBlockRe = /```[^\n]*\n([\s\S]*?)```/g;
  let withoutFences = markdown;
  let match: RegExpExecArray | null;
  while ((match = fencedBlockRe.exec(markdown)) !== null) {
    const body = match[1];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length > 0) spans.push(trimmed);
    }
    withoutFences = withoutFences.replace(match[0], "");
  }

  const inlineSpanRe = /`([^`\n]+)`/g;
  while ((match = inlineSpanRe.exec(withoutFences)) !== null) {
    const span = match[1].trim();
    if (span.length > 0) spans.push(span);
  }

  return spans;
}

// --- 2. Gather every "scripts" key across the workspace ---------------------

function collectWorkspaceScripts(): Set<string> {
  const packageJsonPaths = [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "apps/mobile/package.json",
    "apps/mobile-lynx/package.json",
    "packages/shared/package.json",
    "packages/lib/package.json",
  ];
  const scripts = new Set<string>();
  for (const rel of packageJsonPaths) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const pkg = JSON.parse(readFileSync(abs, "utf8"));
    for (const key of Object.keys(pkg.scripts ?? {})) scripts.add(key);
  }
  return scripts;
}

// --- 3. Classify + verify one span ------------------------------------------

function looksLikePlaceholder(span: string): boolean {
  return span.includes("<") || span.includes(">");
}

function looksLikeNpmPackage(span: string): boolean {
  return span.startsWith("@");
}

function extractBunRunScriptName(tokens: string[]): string | null {
  // tokens[0] === "bun", tokens[1] === "run"
  const rest = tokens.slice(2);
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      if (BUN_FLAGS_WITH_VALUE.has(tok)) i++; // consume the flag's value too
      continue;
    }
    positional.push(tok);
  }
  return positional[0] ?? null;
}

function tokenize(command: string): string[] {
  // Minimal shell-ish tokenizer: splits on whitespace, respects single
  // quotes (enough for spans like `bun run --filter '@yourorg/api' dev`).
  const tokens: string[] = [];
  const re = /'[^']*'|"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    let tok = m[0];
    if (
      (tok.startsWith("'") && tok.endsWith("'")) ||
      (tok.startsWith('"') && tok.endsWith('"'))
    ) {
      tok = tok.slice(1, -1);
    }
    tokens.push(tok);
  }
  return tokens;
}

function checkCommandExists(binary: string): boolean {
  // `command -v` is a shell builtin, not a standalone executable, so it has
  // to be run through a shell rather than exec'd directly.
  const result = Bun.spawnSync(["sh", "-c", `command -v ${binary}`]);
  return result.exitCode === 0;
}

function verifySpan(span: string, workspaceScripts: Set<string>): void {
  if (looksLikePlaceholder(span)) return; // template text, not verifiable
  if (looksLikeNpmPackage(span)) return; // npm scope/package name, not a path

  const tokens = tokenize(span);
  const firstWord = tokens[0] ?? "";

  if (COMMAND_BINARIES.has(firstWord)) {
    // Cross-check `bun run <script>` against real workspace scripts.
    if (firstWord === "bun" && tokens[1] === "run") {
      const scriptName = extractBunRunScriptName(tokens);
      if (scriptName === null) {
        fail(span, "`bun run` with no script name could be extracted");
      }
      if (!workspaceScripts.has(scriptName)) {
        fail(
          span,
          `no package.json in the workspace (root or any app/package) defines a "${scriptName}" script`,
        );
      }
      return;
    }

    if (!checkCommandExists(firstWord)) {
      fail(span, `binary "${firstWord}" is not on PATH`);
    }
    return;
  }

  const isPathCandidate =
    PATH_PREFIXES.some((p) => span.startsWith(p)) ||
    span.startsWith(".") ||
    span === "docker-compose.yml";

  if (isPathCandidate) {
    const abs = join(ROOT, span);
    if (!existsSync(abs)) {
      fail(span, `path does not exist at "${abs}"`);
    }
    return;
  }

  // Not a placeholder, not an npm package, not a known command, not a
  // recognizable repo path — e.g. a bare code identifier (`AppError`), an
  // object-shape sketch (`{code, message}`), or an error-code string
  // (`auth/UNAUTHENTICATED`). Intentionally unverifiable; skip.
}

// --- 4. Run ------------------------------------------------------------------

function main() {
  if (!existsSync(AGENTS_MD_PATH)) {
    console.error(`✗ check:agents-md FAILED: AGENTS.md not found at ${AGENTS_MD_PATH}`);
    process.exit(1);
  }

  const markdown = readFileSync(AGENTS_MD_PATH, "utf8");
  const spans = extractSpans(markdown);
  const workspaceScripts = collectWorkspaceScripts();

  let checked = 0;
  for (const span of spans) {
    verifySpan(span, workspaceScripts);
    checked++;
  }

  console.log(
    `✓ check:agents-md passed — ${checked} backtick span(s) scanned, ` +
      `every checkable path/command in AGENTS.md resolves.`,
  );
}

main();
