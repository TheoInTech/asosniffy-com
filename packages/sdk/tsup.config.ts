import { defineConfig } from "tsup";

// Bundle `@sniffy/scraper/schemas` directly into the SDK's dist so the
// published `@sniffy/sdk` is self-contained. The scraper app is a workspace
// package that never publishes to npm (it's an app, not a library); without
// bundling, npm consumers couldn't resolve the workspace:* dependency.
//
// The schemas are pure Zod definitions with no runtime side effects (see
// scraper/src/schemas/{shared,quote,diagnose,sample,wallet,sniff-pack}.ts),
// so inlining them carries no behavior risk — the bytes that ship to npm
// are identical to what the workspace symlink would have resolved to.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Match the scraper's schema target. Node 22 is the runtime guarantee per
  // the root package.json `engines.node` field.
  target: "node22",
  // Emit .d.ts beside .js. By default rollup-plugin-dts leaves cross-package
  // imports as external references — we tell it to RESOLVE @sniffy/scraper
  // so the schema types get inlined into our .d.ts. Consumers then see no
  // @sniffy/scraper reference in their TypeScript at all.
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  // Force tsup to bundle (rather than externalize) the scraper workspace
  // package. Everything else (viem, zod, @x402/*) stays a peer/runtime dep.
  noExternal: [/^@sniffy\/scraper(\/.*)?$/],
});
