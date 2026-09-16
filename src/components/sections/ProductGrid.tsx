import { useTranslation } from "react-i18next";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { getProducts } from "@/content/products";

export function ProductGrid() {
  const { t } = useTranslation();
  const products = getProducts(t);
  return (
    <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14">
      <Reveal className="max-w-[700px] mx-auto text-center mb-16 md:mb-20">
        <Eyebrow>{t("product.sectionEyebrow")}</Eyebrow>
        <SectionTitle>
          {t("product.sectionTitleLine1")}
          <br />
          <em>{t("product.sectionTitleEm")}</em>
        </SectionTitle>
      </Reveal>

      <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 border border-line">
        {products.map((p, i) => (
          <Reveal
            key={p.emphasis}
            delayMs={i * 90}
            className={`group relative flex flex-col overflow-hidden bg-surface transition-colors hover:bg-gold/[0.03] ${
              i > 0 ? "border-t md:border-t-0 md:border-l border-line" : ""
            }`}
          >
            <span
              aria-hidden
              className="absolute top-0 left-0 h-[3px] w-0 bg-gold transition-[width] duration-500 group-hover:w-full z-[2]"
            />
            <span
              aria-hidden
              className="absolute top-4 right-5 font-serif font-light text-5xl leading-none text-gold/10 z-[1]"
            >
              {p.number}
            </span>
            <img
              src={p.image.url}
              alt={p.image.alt}
              className="block w-full aspect-[16/10] object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="flex-1 px-8 md:px-11 py-10 md:py-12">
              <span className="block font-sans text-[0.62rem] uppercase tracking-[0.35em] text-gold-3 mb-2.5">
                {p.label}
              </span>
              <h3 className="font-serif font-light text-cream leading-[1.1] text-[clamp(1.8rem,3vw,2.6rem)]">
                {p.name && <>{p.name} </>}
                <em className="not-italic italic text-gold">{p.emphasis}</em>
              </h3>
              <span className="block font-serif italic text-muted-warm mb-5 text-base">
                {p.subtitle}
              </span>
              <p className="font-sans text-[0.88rem] leading-[1.9] text-muted-warm mb-7">
                {p.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="font-sans text-[0.6rem] uppercase tracking-[0.18em] text-gold border border-line px-2.5 py-1.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
