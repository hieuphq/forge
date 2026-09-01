// Metro (Expo's bundler) doesn't resolve Bun workspace packages out of the
// box the way Vite does for apps/web — it needs to be told to watch the
// monorepo root and look up node_modules there too, so that
// `@yourorg/shared` (symlinked in by Bun's isolated linker) resolves
// correctly.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Deliberately NOT disabling hierarchical lookup: Bun's isolated linker
// nests each package's own dependencies inside its own node_modules
// (not hoisted to a shared top level), so Metro must still be able to walk
// up from wherever a module lives to find its own local node_modules — e.g.
// @expo/metro-runtime resolving its own transitive deps. Disabling this
// breaks exactly that resolution. The two extra nodeModulesPaths above are
// additive, just for finding workspace packages like @yourorg/shared that
// live above projectRoot.

// packages/shared and packages/lib are plain TypeScript source (no build
// step) and use NodeNext-style relative imports that end in `.js` even
// though the file on disk is `.ts` (e.g. `./auth.errors.js` resolving to
// `./auth.errors.ts`) — that's valid under `moduleResolution: "nodenext"`
// but Metro's default resolver doesn't know to swap the extension, so a
// plain `.js` lookup 404s. Fall back to the `.ts`/`.tsx` sibling only when
// the default resolution for a relative `.js` specifier fails.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = (name) =>
    defaultResolveRequest
      ? defaultResolveRequest(context, name, platform)
      : context.resolveRequest(context, name, platform);

  try {
    return resolve(moduleName);
  } catch (error) {
    const isRelativeJsImport = /^\.\.?\//.test(moduleName) && moduleName.endsWith('.js');
    if (!isRelativeJsImport) {
      throw error;
    }
    const withoutExt = moduleName.slice(0, -'.js'.length);
    for (const ext of ['.ts', '.tsx']) {
      try {
        return resolve(withoutExt + ext);
      } catch {
        // try the next candidate extension
      }
    }
    throw error;
  }
};

module.exports = config;
