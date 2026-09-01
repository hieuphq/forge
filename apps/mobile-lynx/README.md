# apps/mobile-lynx (EXPERIMENTAL)

This is an **experimental** alternative mobile app, built on
[Lynx](https://lynxjs.org/)/ReactLynx via `@lynx-js/rspeedy`. It is **not** the
default mobile app for this template — that's `apps/mobile` (Expo/React Native).

## Why experimental, not default

- **No OTA updates**, as of this template's writing — Expo's EAS Update /
  CodePush-style over-the-air release path has no equivalent here yet, so a
  Lynx app needs an app-store release for every change.
- **Much smaller native-module ecosystem** than React Native — most of the
  community packages (camera, maps, push, etc.) that exist for RN either don't
  have a Lynx equivalent yet or need to be written from scratch.
- **APIs still evolving** — Lynx/ReactLynx and its Rspeedy tooling are young
  and moving; expect breaking changes between minor versions.
- **Isolated by design** — this app lives entirely in its own directory with
  its own toolchain (Rspeedy/Rspack instead of Metro), so it can be adopted,
  ignored, or dropped without disturbing the rest of the workspace.

**Removal is safe and clean:** `rm -rf apps/mobile-lynx` is all it takes.
Nothing outside this directory references it — the root workspace only picks
it up via the generic `apps/*` glob in the root `package.json`, not a
hardcoded path — so deleting it leaves the rest of the monorepo (`apps/api`,
`apps/web`, `apps/mobile`, `packages/*`) untouched and the workspace green.

## Status

Scaffolded via `bunx create-rspeedy@latest --template react` and wired to
`@yourorg/shared` (`workspace:*`) to prove the workspace package resolves and
builds through this app's toolchain. `bun run build` (`rspeedy build`) exits 0
and produces `dist/main.lynx.bundle`. Treat it as scratch space to build on
top of, not a finished app shell — the scaffold is still the stock "flappy
bird tap demo" starter.

## Technical findings from the workspace-import spike

- Rspack/Rsbuild resolved the `@yourorg/shared` workspace import with **zero
  extra config** — no `resolve.alias`, no custom `moduleResolution`, no
  tsconfig `paths`. The package's existing `main`/`types` (pointing at
  NodeNext-relative `.ts` source on disk) just worked.
- This is notably easier than `apps/mobile` (Expo/Metro), where the same
  import style needed a Metro `resolveRequest` workaround.
- `bun install` from the repo root resolves cleanly under Bun's isolated
  linker; no root-level config changes were needed beyond what the existing
  `apps/*` workspace glob already covers.
- The built bundle (`dist/main.lynx.bundle`) is a binary Lynx format, not
  plain JS text, but a raw byte-level grep for a literal string sourced from
  `packages/shared` confirms the import is genuinely inlined, not
  tree-shaken into a stub.
- `mobile-lynx` has no `typecheck` script; `bun run --workspaces --if-present
  typecheck` silently skips it (its own build already runs a type checker via
  `@rsbuild/plugin-type-check`). `bun run lint` (`oxlint`)'s `boundaries/*`
  rules are scoped to `apps/web/src/**` only, so this app isn't linted by
  them; oxlint's own pass over the repo raises nothing for it.
