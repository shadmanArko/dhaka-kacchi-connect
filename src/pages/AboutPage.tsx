import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { StoryBlock } from "@/components/sections/StoryBlock";
import { CardGrid } from "@/components/sections/CardGrid";
import { CTASection } from "@/components/sections/CTASection";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Typography";
import { getValues } from "@/content/whyUs";
import kacchi from "@/assets/kacchi.jpg";
import borhani2 from "@/assets/borhani-2-web.jpg";

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHero
        eyebrow={t("about.hero.eyebrow")}
        title={
          <>
            {t("about.hero.titleLine1")}
            <br />
            {t("about.hero.titleLine2")}
            <br />
            <em>{t("about.hero.titleEm")}</em>
          </>
        }
        body={t("about.hero.body")}
      />

      <StoryBlock
        eyebrow={t("about.story1.eyebrow")}
        title={
          <>
            {t("about.story1.titleLine1")}
            <br />
            <em>{t("about.story1.titleEm")}</em>
          </>
        }
        paragraphs={[t("about.story1.p1"), t("about.story1.p2")]}
        quote={t("about.story1.quote")}
        tags={t("about.story1.tags").split("|")}
        image={{ url: kacchi, alt: "Dhaka Kacchi Berlin" }}
        badge={{ value: t("about.story1.badgeValue"), label: t("about.story1.badgeLabel") }}
      />

      <StoryBlock
        background="deep"
        reverse
        eyebrow={t("about.story2.eyebrow")}
        title={
          <>
            {t("about.story2.titlePre")}
            <br />
            <em>{t("about.story2.titleEm")}</em>
          </>
        }
        paragraphs={[t("about.story2.p1"), t("about.story2.p2"), t("about.story2.p3")]}
        quote={t("about.story2.quote")}
        image={{ url: borhani2, alt: "Borhani Berlin" }}
        badge={{ value: t("about.story2.badgeValue"), label: t("about.story2.badgeLabel") }}
      />

      <CardGrid
        eyebrow={t("values.eyebrow")}
        title={
          <>
            {t("values.titlePre")} <em>{t("values.titleEm")}</em>
          </>
        }
        cards={getValues(t)}
      />

      <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14 text-center">
        <Reveal className="max-w-[900px] mx-auto">
          <Eyebrow className="mb-7">{t("about.mission.eyebrow")}</Eyebrow>
          <blockquote className="font-serif font-light italic text-cream leading-[1.5] text-[clamp(1.6rem,3vw,2.6rem)] border-l-2 border-gold pl-10 text-left mb-8">
            {t("about.mission.quote")}
          </blockquote>
          <cite className="not-italic font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3">
            {t("about.mission.cite")}
          </cite>
        </Reveal>
      </section>

      <CTASection
        eyebrow={t("about.cta.eyebrow")}
        title={
          <>
            {t("about.cta.titlePre")} <em>{t("about.cta.titleEm")}</em>
          </>
        }
        body={t("about.cta.body")}
        ctaLabel={t("about.cta.label")}
        ctaTo="/subscribe"
        footnote={t("about.cta.footnote")}
      />
    </>
  );
}
