/**
 * esbuild packager for Chrome MV3 entries + static assets.
 * Location: packages/extension/scripts/build-extension.mjs
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist-ext");

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: {
    background: join(root, "src/background/service-worker.ts"),
    content: join(root, "src/content/inspect.ts"),
    sidepanel: join(root, "src/sidepanel/sidepanel.ts"),
  },
  bundle: true,
  outdir: outDir,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
});

cpSync(join(root, "src/sidepanel/sidepanel.html"), join(outDir, "sidepanel.html"));
cpSync(join(root, "src/sidepanel/sidepanel.css"), join(outDir, "sidepanel.css"));

const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Extension packed → ${outDir}`);
