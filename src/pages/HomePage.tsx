import { useTranslation } from "react-i18next";
import { Hero } from "@/components/sections/Hero";
import { BerlinBanner } from "@/components/sections/BerlinBanner";
import { ProductGrid } from "@/components/sections/ProductGrid";
import { CardGrid } from "@/components/sections/CardGrid";
import { StoryBlock } from "@/components/sections/StoryBlock";
import { FoodSpotlight } from "@/components/sections/FoodSpotlight";
import { Timeline } from "@/components/sections/Timeline";
import { CTASection } from "@/components/sections/CTASection";
import { SocialSection } from "@/components/sections/SocialSection";
import { getWhyUs } from "@/content/whyUs";
import kacchiBorhani from "@/assets/Kacchi-and-Borhani.jpg";

/** Shared by both the English route (routes/index.tsx) and the German one
 * (routes/$locale/_layout.index.tsx) - see src/routes/$locale/_layout.tsx
 * for why the route tree has two thin wrappers instead of one route with a
 * runtime locale branch (typed `to` paths on every Link/ButtonLink need a
 * real, fixed route to point at). */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <Hero />
      <BerlinBanner />
      <ProductGrid />
      <CardGrid
        eyebrow={t("whyUs.eyebrow")}
        title={
          <>
            {t("whyUs.titlePre")} <em>{t("whyUs.titleEm")}</em>
            <br />
            {t("whyUs.titleLine2")}
          </>
        }
        cards={getWhyUs(t)}
      />
      <StoryBlock
        eyebrow={t("home.story.eyebrow")}
        title={
          <>
            {t("home.story.titleLine1")}
            <br />
            <em>{t("home.story.titleEm")}</em>
          </>
        }
        paragraphs={[t("home.story.p1"), t("home.story.p2")]}
        quote={t("home.story.quote")}
        tags={t("home.story.tags").split("|")}
        image={{ url: kacchiBorhani, alt: "Kacchi and Borhani — Dhaka Kacchi Berlin" }}
        badge={{ value: t("home.story.badgeValue"), label: t("home.story.badgeLabel") }}
      />
      <FoodSpotlight />
      <Timeline />
      <CTASection
        eyebrow={t("home.cta.eyebrow")}
        title={
          <>
            {t("home.cta.titlePre")}
            <br />
            <em>{t("home.cta.titleEm")}</em>
          </>
        }
        body={t("home.cta.body")}
        ctaLabel={t("home.cta.label")}
        ctaTo="/subscribe"
        footnote={t("home.cta.footnote")}
      />
      <SocialSection />
    </>
  );
}
