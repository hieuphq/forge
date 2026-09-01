#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const rootPackage = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { name?: string };

// Installing dependencies in the template repository must never personalise
// the template itself. `bun create` rewrites the destination package name
// before installation, so only a scaffold reaches the setup command below.
if (rootPackage.name === "forge") {
  console.log("[postinstall] template checkout detected; skipping personalisation");
  process.exit(0);
}

const apiPackagePath = path.join(process.cwd(), "apps/api/package.json");
const apiPackageName = existsSync(apiPackagePath)
  ? (JSON.parse(readFileSync(apiPackagePath, "utf8")) as { name?: string }).name
  : undefined;

// Local templates copy ignored build output from the working checkout. Remove
// it only on the first, still-unpersonalised install; later installs must not
// delete a project's own build artifacts.
if (apiPackageName === "@yourorg/api") {
  for (const output of [
    "apps/web/dist",
    "apps/mobile-lynx/dist",
    "apps/mobile/dist-ci-check",
  ]) {
    rmSync(path.join(process.cwd(), output), { recursive: true, force: true });
  }
}

const result = Bun.spawnSync(["bun", "run", "setup"], {
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(result.exitCode);
