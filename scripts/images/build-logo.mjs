// Builds every logo-derived asset from the single master, assets-src/logo.png
// (gold artwork on a flat charcoal square). Called from build-images.mjs, so
// `bun run images:build` regenerates the site logo, the favicons and the
// social-share card together.
//
// The master has no alpha channel, so the first job is to lift the artwork off
// its background: each pixel is treated as gold blended over the background
// colour, the blend ratio becomes alpha, and the colour is un-blended. The
// result sits cleanly on the site's near-black theme with no visible box and
// no CSS colour filter.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MASTER = path.resolve("assets-src/logo.png");
const PHOTOS_DIR = path.resolve("src/assets/photos");
const PUBLIC_DIR = path.resolve("public");
const FAVICON_DIR = path.join(PUBLIC_DIR, "favicons");

// The site background (--black-ink in styles.css), used behind the icons.
const SITE_BG = { r: 7, g: 7, b: 10 };

async function cutOut() {
  const { data, info } = await sharp(MASTER)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  // Flat background: sample the corner.
  const bg = [data[0], data[1], data[2]];
  const dist = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const dr = data[i * 3] - bg[0];
    const dg = data[i * 3 + 1] - bg[1];
    const db = data[i * 3 + 2] - bg[2];
    dist[i] = Math.hypot(dr, dg, db);
  }
  // Pixels that are clearly artwork define "fully opaque".
  const strong = Array.from(dist)
    .filter((d) => d > 60)
    .sort((a, b) => a - b);
  const full = strong[Math.floor(strong.length * 0.2)] ?? 150;

  const out = Buffer.alloc(width * height * 4);
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let i = 0; i < width * height; i++) {
    let a = Math.min(1, dist[i] / full);
    if (a < 0.04) a = 0;
    for (let c = 0; c < 3; c++) {
      const p = data[i * 3 + c];
      const v = a > 0 && a < 1 ? (p - (1 - a) * bg[c]) / a : p;
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    out[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.1) {
      const x = i % width,
        y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { rgba: out, width, height, bbox: { minX, minY, maxX, maxY }, bg };
}

function ico(pngs) {
  // ICO container holding PNG images (supported by every current browser).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

export async function buildLogo() {
  const { rgba, width, height, bbox } = await cutOut();
  const pad = Math.round(width * 0.01);
  const crop = (b, p) => ({
    left: Math.max(0, b.minX - p),
    top: Math.max(0, b.minY - p),
    width: Math.min(width, b.maxX + p) - Math.max(0, b.minX - p) + 1,
    height: Math.min(height, b.maxY + p) - Math.max(0, b.minY - p) + 1,
  });
  const art = () => sharp(rgba, { raw: { width, height, channels: 4 } });

  // 1. The header/footer logo: the full lockup, tightly cropped, transparent.
  const lockup = await art().extract(crop(bbox, pad)).png().toBuffer();
  await sharp(lockup)
    .resize({ width: 640 })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(path.join(PHOTOS_DIR, "logo.webp"));

  // 2. The icon: just the pot and steam (the wordmark is unreadable at 16 px).
  // The pot is the left-hand block of the lockup, left of the "D".
  const potRight = Math.round(bbox.minX + (bbox.maxX - bbox.minX) * 0.2);
  const potBox = { minX: bbox.minX, minY: bbox.minY, maxX: potRight, maxY: bbox.maxY };
  // Reduce the box to the pot's own rows (it ends above "BERLIN" and its rule).
  const potCrop = crop(potBox, pad);
  potCrop.height = Math.round((bbox.maxY - bbox.minY) * 0.84);
  const pot = await art().extract(potCrop).png().toBuffer();
  const potMeta = await sharp(pot).metadata();
  const side = Math.round(Math.max(potMeta.width, potMeta.height) * 1.2);
  const square = await sharp({
    create: { width: side, height: side, channels: 4, background: { ...SITE_BG, alpha: 1 } },
  })
    .composite([{ input: pot, gravity: "center" }])
    .png()
    .toBuffer();

  await mkdir(FAVICON_DIR, { recursive: true });
  const sizes = [16, 32, 48, 64, 128, 180, 192, 512];
  const pngs = {};
  for (const s of sizes) {
    pngs[s] = await sharp(square).resize(s, s).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(FAVICON_DIR, `icon-${s}.png`), pngs[s]);
  }
  await writeFile(path.join(FAVICON_DIR, "apple-touch-icon.png"), pngs[180]);
  for (const s of [16, 32, 48])
    await writeFile(path.join(FAVICON_DIR, `favicon-${s}.png`), pngs[s]);
  await writeFile(
    path.join(PUBLIC_DIR, "favicon.ico"),
    ico([16, 32, 48].map((s) => ({ size: s, buf: pngs[s] }))),
  );

  // 3. The social-share card (WhatsApp, Facebook, LinkedIn): 1200x630, the
  // lockup centred on the brand's own charcoal.
  const card = await sharp(lockup).resize({ height: 440, fit: "inside" }).toBuffer();
  await sharp({
    create: { width: 1200, height: 630, channels: 3, background: { r: 31, g: 29, b: 30 } },
  })
    .composite([{ input: card, gravity: "center" }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(path.join(PUBLIC_DIR, "og-image.jpg"));

  return { lockup, square };
}
