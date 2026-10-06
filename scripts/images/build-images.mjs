// Generates the responsive AVIF + WebP variants the site serves from the
// master photos in assets-src/. Run manually after adding or replacing a
// master:  bun run images:build
//
// Outputs are COMMITTED (src/assets/photos/<name>-<width>.{avif,webp}), not
// produced at deploy time - the CI build stays a plain `vite build` with no
// native image toolchain, and a reviewer can see exactly what ships.
//
// File naming is the contract with src/lib/photos.ts, which discovers the
// variants with import.meta.glob and builds the srcset from the width in the
// filename. Adding a width here needs no code change anywhere else.
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildLogo } from "./build-logo.mjs";

const SRC_DIR = path.resolve("assets-src");
const OUT_DIR = path.resolve("src/assets/photos");

// Target widths per photo, in CSS-px-at-DPR terms: the smallest serves
// ~240-px-wide slots at 2x, the largest is the master's own width (we never
// upscale). Photos displayed in a ~600 px column top out at 1200 (2x).
const PHOTOS = {
  kacchi: [480, 800, 1313],
  "kacchi-and-borhani": [480, 800, 1200],
  "borhani-2": [480, 900],
  "borhani-3": [480, 900],
};

// WebP q75 / AVIF q50 are visually equivalent for food photography (AVIF's
// scale is harsher: q50 ~ WebP q75-80). effort trades encode time for size;
// it only runs when a master changes, so spend it.
const WEBP = { quality: 75, effort: 6 };
const AVIF = { quality: 50, effort: 6 };

await mkdir(OUT_DIR, { recursive: true });
for (const f of await readdir(OUT_DIR)) await rm(path.join(OUT_DIR, f));

for (const [name, widths] of Object.entries(PHOTOS)) {
  const master = sharp(path.join(SRC_DIR, `${name}.jpg`));
  const { width: masterWidth } = await master.metadata();
  for (const w of widths) {
    if (w > masterWidth)
      throw new Error(`${name}: ${w}px is wider than the ${masterWidth}px master`);
    const resized = () => master.clone().resize({ width: w, withoutEnlargement: true });
    await resized()
      .webp(WEBP)
      .toFile(path.join(OUT_DIR, `${name}-${w}.webp`));
    await resized()
      .avif(AVIF)
      .toFile(path.join(OUT_DIR, `${name}-${w}.avif`));
  }
}

// Logo, favicons and the social-share card, all derived from assets-src/logo.png.
await buildLogo();

console.log(
  `wrote ${(await readdir(OUT_DIR)).length} files to ${path.relative(process.cwd(), OUT_DIR)}`,
);
