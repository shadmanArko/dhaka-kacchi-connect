import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { timeline } from "@/content/timeline";

export function Timeline() {
  return (
    <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14">
      <div className="max-w-[900px] mx-auto">
        <Reveal className="mb-16 md:mb-20">
          <Eyebrow>How to Order in Berlin</Eyebrow>
          <SectionTitle>
            Simple as <em>one message.</em>
          </SectionTitle>
        </Reveal>

        <div
          className="relative pl-12"
          style={{
            backgroundImage: "linear-gradient(180deg, var(--color-gold) 0%, transparent 100%)",
            backgroundSize: "1px 100%",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 0.5rem",
          }}
        >
          {timeline.map((t, i) => (
            <Reveal key={t.title} delayMs={i * 90} className="relative pl-8 pb-14 last:pb-0">
              <span
                aria-hidden
                className="absolute -left-[45px] top-2 w-2.5 h-2.5 rounded-full bg-gold border-2 border-black-ink"
              />
              <span className="block font-sans text-[0.68rem] uppercase tracking-[0.35em] text-gold mb-2.5">
                {t.step}
              </span>
              <h3 className="font-serif font-normal text-cream text-[1.4rem] mb-3">{t.title}</h3>
              <p className="font-sans text-[0.9rem] leading-[1.85] text-muted-warm max-w-[560px]">
                {t.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
