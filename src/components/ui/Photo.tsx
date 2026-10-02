import type { ImgHTMLAttributes } from "react";
import { photoSources, type PhotoName } from "@/lib/photos";

type Props = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "sizes" | "width" | "height"
> & {
  name: PhotoName;
  alt: string;
  /** Required: without an accurate `sizes` the browser assumes 100vw and
   * downloads a larger file than the slot needs. Describe the slot's CSS
   * width at each breakpoint, same as for a plain <img sizes>. */
  sizes: string;
};

/**
 * <picture> with an AVIF source (smallest, ~93% of browsers) and a WebP
 * source/fallback (everything else that matters), each with width descriptors
 * so the browser picks the variant for the slot size and screen density.
 *
 * `display: contents` on the <picture> removes its own box, so the <img>
 * keeps behaving exactly as the old bare <img> did inside whatever
 * positioned / aspect-ratio'd parent it sits in.
 */
export function Photo({ name, alt, sizes, className, ...rest }: Props) {
  const { avifSrcSet, webpSrcSet, src, width, height } = photoSources(name);
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
      <img
        src={src}
        width={width}
        height={height}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        {...rest}
      />
    </picture>
  );
}
