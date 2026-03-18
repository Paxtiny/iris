import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
const targetFlag = args.indexOf("--target");
const targets =
  targetFlag !== -1 && args[targetFlag + 1]
    ? [args[targetFlag + 1]]
    : ["chrome", "firefox"];

const commonOptions = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: "es2022",
  format: "esm",
};

for (const target of targets) {
  const outdir = `dist/${target}`;
  mkdirSync(outdir, { recursive: true });

  // Build content script (Gmail injection)
  await esbuild.build({
    ...commonOptions,
    entryPoints: ["src/platforms/chrome/content-gmail.ts"],
    outfile: `${outdir}/content-gmail.js`,
    format: "iife",
  });

  // Build popup
  await esbuild.build({
    ...commonOptions,
    entryPoints: ["src/platforms/chrome/popup.ts"],
    outfile: `${outdir}/popup.js`,
    format: "iife",
  });

  // Build background service worker
  await esbuild.build({
    ...commonOptions,
    entryPoints: ["src/platforms/chrome/background.ts"],
    outfile: `${outdir}/background.js`,
    format: "iife",
  });

  // Copy manifest
  const manifestSrc = `src/platforms/${target}/manifest.json`;
  if (existsSync(manifestSrc)) {
    cpSync(manifestSrc, `${outdir}/manifest.json`);
  }

  // Copy popup HTML
  cpSync("src/platforms/chrome/popup.html", `${outdir}/popup.html`);

  // Copy styles
  cpSync("src/ui/styles.css", `${outdir}/styles.css`);

  console.log(`Built ${target} extension -> ${outdir}/`);
}
