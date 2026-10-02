/**
 * The site's photographs, as responsive AVIF + WebP variants.
 *
 * The variants are generated from the masters in assets-src/ by
 * scripts/images/build-images.mjs (`bun run images:build`) and committed to
 * src/assets/photos/ as `<name>-<width>.{avif,webp}`. This module discovers
 * them with import.meta.glob - Vite fingerprints each file and hands back its
 * URL - and builds the `srcset` from the width in the filename, so adding a
 * width or a photo means editing the generator script only.
 *
 * ONE photo -> ONE set of files, used by every component that shows it (the
 * hero, the product card and the spotlight all show `kacchi`). That is what
 * stops the same picture being downloaded twice under two different filenames,
 * which is how the old kacchi.jpg + kacchi-900.jpg pair behaved.
 */

const files = import.meta.glob<string>("../assets/photos/*-*.{avif,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Intrinsic size of the widest variant - used for width/height attributes so
 * the browser can reserve the box before the bytes arrive (no layout shift). */
export const PHOTOS = {
  kacchi: { width: 1313, height: 1050 },
  "kacchi-and-borhani": { width: 1200, height: 906 },
  "borhani-2": { width: 900, height: 600 },
  "borhani-3": { width: 900, height: 600 },
} as const;

export type PhotoName = keyof typeof PHOTOS;
type Format = "avif" | "webp";

/** `[width, url]` pairs for one photo in one format, ascending by width. */
function variants(name: PhotoName, format: Format): [number, string][] {
  const out: [number, string][] = [];
  for (const [path, url] of Object.entries(files)) {
    const m = path.match(/\/([^/]+)-(\d+)\.(avif|webp)$/);
    if (m && m[1] === name && m[3] === format) out.push([Number(m[2]), url]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function photoSources(name: PhotoName) {
  const toSrcSet = (v: [number, string][]) => v.map(([w, url]) => `${url} ${w}w`).join(", ");
  const webp = variants(name, "webp");
  return {
    avifSrcSet: toSrcSet(variants(name, "avif")),
    webpSrcSet: toSrcSet(webp),
    /** Plain `src` for the <img> fallback: the middle width, a sane default
     * for the (rare) client that ignores <picture>/srcset entirely. */
    src: webp[Math.floor(webp.length / 2)]?.[1] ?? "",
    ...PHOTOS[name],
  };
}
